import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { config } from "dotenv";
import { createPrismaClient } from "db";
import { createBarberLink, handleStart, parseStartPayload } from "./bot-flow.js";
import { createBooking } from "./booking.js";
import { setNoticeSender } from "./notify.js";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const phone = "+998901550077";
const telegramId = "515151";
const barberId = "20000000-0000-4000-8000-000000000003";
const serviceId = "10000000-0000-4000-8000-000000000001";

test("payload /start читается отдельно от команды", () => {
  assert.equal(parseStartPayload("/start b_token"), "b_token");
  assert.equal(parseStartPayload("/start@KromkaBot barber_abc"), "barber_abc");
  assert.equal(parseStartPayload("/start"), "");
});

test("webhook без токена отвечает 503, с неверным секретом — 401", async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = "";
  process.env.TELEGRAM_WEBHOOK_SECRET = "hook-secret";
  const { buildApp } = await import("./app.js");
  const app = await buildApp();
  try {
    const missing = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": "hook-secret" },
      payload: { update_id: 1 },
    });
    assert.equal(missing.statusCode, 503);

    const denied = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": "wrong" },
      payload: { update_id: 1 },
    });
    assert.equal(denied.statusCode, 401);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = previousToken;
    process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    await app.close();
  }
});

test("deep link привязывает клиента, барбер получает новую запись, код привязки одноразовый", async (t) => {
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    t.skip("нет DATABASE_URL");
    return;
  }

  const db = createPrismaClient();
  const sent: string[] = [];
  setNoticeSender(async (_chatId, text) => {
    sent.push(text);
  });
  const previous = await db.barber.findUnique({ where: { id: barberId }, select: { telegramChatId: true } });

  try {
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { OR: [{ phone }, { telegramId }] } });
    await db.barberLink.deleteMany({ where: { barberId } });
    await db.barber.update({ where: { id: barberId }, data: { telegramChatId: "9001" } });

    const days = await (await import("./app.js")).buildApp();
    const openResponse = await days.inject({
      method: "GET",
      url: `/api/v1/availability/days?serviceIds=${serviceId}&barberId=${barberId}`,
    });
    const open = (openResponse.json() as { days: { date: string; available: boolean }[] }).days.find((day) => day.available);
    assert.ok(open);
    const slotsResponse = await days.inject({
      method: "GET",
      url: `/api/v1/availability?serviceIds=${serviceId}&barberId=${barberId}&date=${open.date}`,
    });
    const slot = (slotsResponse.json() as { slots: string[] }).slots.at(-1);
    assert.ok(slot);
    await days.close();

    const booking = await createBooking(db, {
      serviceIds: [serviceId],
      barberId,
      startsAt: new Date(`${open.date}T${slot}:00+05:00`).toISOString(),
      client: { name: "Проверка", phone },
    });
    assert.ok(sent.some((text) => text.startsWith("Новая запись.")));

    const linked = await handleStart(db, { telegramId, chatId: telegramId, firstName: "Иван", payload: `b_${booking.manageToken}` });
    assert.match(linked.text, /Запись привязана/);
    const client = await db.client.findUnique({ where: { telegramId } });
    assert.equal(client?.phone, phone);

    const { cancelBooking } = await import("./booking.js");
    await cancelBooking(db, booking.manageToken);
    assert.ok(sent.some((text) => text.startsWith("Запись отменена.") && text.includes("Проверка")));
    assert.ok(sent.some((text) => text.startsWith("Запись отменена.") && !text.includes(phone)));

    const created = await createBarberLink(db, barberId);
    const claimed = await handleStart(db, { telegramId: "1", chatId: "4242", firstName: "Мастер", payload: `barber_${created.code}` });
    assert.match(claimed.text, /Вы привязаны/);
    const again = await handleStart(db, { telegramId: "1", chatId: "111", firstName: "Мастер", payload: `barber_${created.code}` });
    assert.match(again.text, /уже использована/);
    const barber = await db.barber.findUnique({ where: { id: barberId } });
    assert.equal(barber?.telegramChatId, "4242");
  } finally {
    setNoticeSender(null);
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { OR: [{ phone }, { telegramId }] } });
    await db.barberLink.deleteMany({ where: { barberId } });
    await db.barber.update({ where: { id: barberId }, data: { telegramChatId: previous?.telegramChatId ?? null } });
    await db.$disconnect();
  }
});

test("/start отвечает через webhook", async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = "123456:TESTTOKEN12";
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const { buildApp } = await import("./app.js");
  const { getBot } = await import("./bot.js");
  const app = await buildApp();
  const sent: string[] = [];
  getBot()?.api.config.use(async (_prev, method, payload) => {
    if (method === "sendMessage") sent.push(String((payload as { text?: string }).text ?? ""));
    return { ok: true, result: true } as never;
  });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: {
        update_id: 1,
        message: {
          message_id: 1,
          date: 1,
          chat: { id: 777, type: "private" },
          from: { id: 777, is_bot: false, first_name: "Иван" },
          text: "/start",
          entities: [{ type: "bot_command", offset: 0, length: 6 }],
        },
      },
    });
    assert.equal(response.statusCode, 200);
    assert.ok(sent.some((text) => text.includes("Кромка")));
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = previousToken;
    process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    await app.close();
  }
});
