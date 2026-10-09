import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { config } from "dotenv";
import { createPrismaClient } from "db";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const phone = "+998901330044";
const telegramId = "424242";
const serviceId = "10000000-0000-4000-8000-000000000001";
const barberId = "20000000-0000-4000-8000-000000000002";

function sign(botToken: string) {
  const params = new URLSearchParams({
    user: JSON.stringify({ id: Number(telegramId), first_name: "Иван", last_name: "Петров" }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });
  const dataCheck = [...params.keys()]
    .sort()
    .map((key) => `${key}=${params.get(key)}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheck).digest("hex"));
  return params.toString();
}

test("initData привязывает клиента и повтор слота даёт 409", async (t) => {
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    t.skip("нет DATABASE_URL");
    return;
  }

  process.env.TELEGRAM_BOT_TOKEN = "stage6-test-token";
  const initData = sign(process.env.TELEGRAM_BOT_TOKEN);
  const { buildApp } = await import("./app.js");
  const db = createPrismaClient();
  const app = await buildApp();

  try {
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { OR: [{ phone }, { telegramId }] } });

    const empty = await app.inject({ method: "POST", url: "/api/v1/telegram/session", payload: { initData } });
    assert.equal(empty.statusCode, 200);
    assert.equal((empty.json() as { client: null }).client, null);

    const days = await app.inject({
      method: "GET",
      url: `/api/v1/availability/days?serviceIds=${serviceId}&barberId=${barberId}`,
    });
    const open = (days.json() as { days: { date: string; available: boolean }[] }).days.find((day) => day.available);
    assert.ok(open);
    const slots = await app.inject({
      method: "GET",
      url: `/api/v1/availability?serviceIds=${serviceId}&barberId=${barberId}&date=${open.date}`,
    });
    const slot = (slots.json() as { slots: string[] }).slots[0];
    assert.ok(slot);
    const payload = {
      serviceIds: [serviceId],
      barberId,
      startsAt: new Date(`${open.date}T${slot}:00+05:00`).toISOString(),
      client: { name: "Иван Петров", phone },
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      headers: { "x-telegram-init-data": initData },
      payload,
    });
    assert.equal(created.statusCode, 201);
    assert.equal((created.json() as { booking: { client: { name: string } } }).booking.client.name, "Иван Петров");

    const again = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      headers: { "x-telegram-init-data": initData },
      payload,
    });
    assert.equal(again.statusCode, 409);
    assert.equal((again.json() as { error: { code: string } }).error.code, "SLOT_TAKEN");

    const session = await app.inject({ method: "POST", url: "/api/v1/telegram/session", payload: { initData } });
    const body = session.json() as { client: { phone: string }; bookings: { status: string; manageToken: string }[] };
    assert.equal(body.client.phone, phone);
    assert.equal(body.bookings.length, 1);
    assert.equal(body.bookings[0]?.status, "confirmed");

    const stored = await db.client.findUnique({ where: { telegramId } });
    assert.equal(stored?.telegramChatId, telegramId);
    const booking = await db.booking.findFirst({ where: { client: { telegramId } } });
    assert.equal(booking?.source, "telegram");
  } finally {
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { OR: [{ phone }, { telegramId }] } });
    await db.$disconnect();
    await app.close();
  }
});
