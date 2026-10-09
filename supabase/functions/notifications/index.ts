import { createClient } from "npm:@supabase/supabase-js@2";
import { dayBounds, dayText, reviewCutoff, reviewKeyboard, reviewText, soonBounds, soonText } from "./windows.ts";

type Visit = {
  id: string;
  starts_at: string;
  clients: { telegram_chat_id: string | null; name: string } | { telegram_chat_id: string | null; name: string }[] | null;
  barbers: { name: string } | { name: string }[] | null;
  booking_services: { name: string }[] | null;
};

const visitSelect = "id, starts_at, ends_at, clients!inner(name, telegram_chat_id), barbers!inner(name), booking_services(name)";

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function chatOf(visit: Visit) {
  return one(visit.clients)?.telegram_chat_id ?? null;
}

function textOf(visit: Visit, kind: "day" | "soon" | "review") {
  const when = new Date(visit.starts_at);
  const services = (visit.booking_services ?? []).map((service) => service.name).join(", ");
  const barber = one(visit.barbers)?.name ?? "мастеру";
  if (kind === "day") return { text: dayText(when, services, barber) };
  if (kind === "soon") return { text: soonText(when, services, barber) };
  return { text: reviewText(barber), reply_markup: reviewKeyboard(visit.id) };
}

async function claim(
  db: ReturnType<typeof createClient>,
  id: string,
  column: "reminder_day_sent_at" | "reminder_30m_sent_at" | "review_requested_at",
  now: string,
) {
  const { data, error } = await db.from("bookings").update({ [column]: now }).eq("id", id).is(column, null).select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

async function release(
  db: ReturnType<typeof createClient>,
  id: string,
  column: "reminder_day_sent_at" | "reminder_30m_sent_at" | "review_requested_at",
) {
  await db.from("bookings").update({ [column]: null }).eq("id", id);
}

async function sendTelegram(token: string, chatId: string, text: string, replyMarkup?: ReturnType<typeof reviewKeyboard>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  });
  if (!response.ok) throw new Error("Telegram не принял сообщение");
}

async function setting(db: ReturnType<typeof createClient>, key: string, fallback: number) {
  const { data } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  const value = Number(data?.value);
  return Number.isFinite(value) ? value : fallback;
}

Deno.serve(async (request) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const auth = request.headers.get("Authorization") ?? "";
  const cron = request.headers.get("x-cron-secret") ?? "";
  const allowed = (serviceKey && auth === `Bearer ${serviceKey}`) || (cronSecret && cron === cronSecret);
  if (!allowed) return Response.json({ error: "unauthorized" }, { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!supabaseUrl || !serviceKey || !token) {
    return Response.json({ error: "missing secrets" }, { status: 503 });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const [dayMinutes, shortMinutes, reviewDelayMin] = await Promise.all([
    setting(db, "reminder_day_minutes", 1440),
    setting(db, "reminder_short_minutes", 30),
    setting(db, "review_delay_min", 60),
  ]);
  const day = dayBounds(now, dayMinutes);
  const soon = soonBounds(now, shortMinutes);
  const result = { day: 0, soon: 0, completed: 0, reviews: 0 };

  async function pump(visits: Visit[], column: "reminder_day_sent_at" | "reminder_30m_sent_at" | "review_requested_at", kind: "day" | "soon" | "review") {
    let sent = 0;
    for (const visit of visits) {
      const chatId = chatOf(visit);
      if (!chatId || !(await claim(db, visit.id, column, stamp))) continue;
      try {
        const message = textOf(visit, kind);
        await sendTelegram(token, chatId, message.text, "reply_markup" in message ? message.reply_markup : undefined);
        sent += 1;
      } catch {
        await release(db, visit.id, column);
      }
    }
    return sent;
  }

  const dayVisits = await db
    .from("bookings")
    .select(visitSelect)
    .eq("status", "confirmed")
    .is("reminder_day_sent_at", null)
    .gt("starts_at", day.after.toISOString())
    .lte("starts_at", day.until.toISOString());
  if (dayVisits.error) throw new Error(dayVisits.error.message);
  result.day = await pump((dayVisits.data ?? []) as Visit[], "reminder_day_sent_at", "day");

  const soonVisits = await db
    .from("bookings")
    .select(visitSelect)
    .eq("status", "confirmed")
    .is("reminder_30m_sent_at", null)
    .gt("starts_at", soon.after.toISOString())
    .lte("starts_at", soon.until.toISOString());
  if (soonVisits.error) throw new Error(soonVisits.error.message);
  result.soon = await pump((soonVisits.data ?? []) as Visit[], "reminder_30m_sent_at", "soon");

  const completed = await db
    .from("bookings")
    .update({ status: "completed", auto_completed_at: stamp })
    .eq("status", "confirmed")
    .lt("ends_at", stamp)
    .is("auto_completed_at", null)
    .select("id");
  if (completed.error) throw new Error(completed.error.message);
  result.completed = completed.data?.length ?? 0;

  const reviewVisits = await db
    .from("bookings")
    .select(visitSelect)
    .eq("status", "completed")
    .is("review_requested_at", null)
    .lte("ends_at", reviewCutoff(now, reviewDelayMin).toISOString());
  if (reviewVisits.error) throw new Error(reviewVisits.error.message);
  result.reviews = await pump((reviewVisits.data ?? []) as Visit[], "review_requested_at", "review");

  return Response.json(result);
});
