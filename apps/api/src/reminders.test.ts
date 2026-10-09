import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { config } from "dotenv";
import { createPrismaClient } from "db";
import { runNotifications, saveReview } from "./reminders.js";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const phone = "+998901660088";
const chatId = "770770";
const barberId = "20000000-0000-4000-8000-000000000003";
const serviceId = "10000000-0000-4000-8000-000000000001";
const marker = "Проверка напоминания";

test("повторный запуск не шлёт напоминание и отзыв второй раз", async (t) => {
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    t.skip("нет DATABASE_URL");
    return;
  }

  const db = createPrismaClient();
  const sent: string[] = [];
  const now = Date.now();

  try {
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { phone } });
    const client = await db.client.create({ data: { name: "Напоминание", phone, telegramId: chatId, telegramChatId: chatId } });
    const createVisit = (startsAt: Date, endsAt: Date) =>
      db.booking.create({
        data: {
          clientId: client.id,
          barberId,
          startsAt,
          endsAt,
          totalPrice: 120000,
          totalDurationMin: 45,
          status: "confirmed",
          source: "telegram",
          services: { create: [{ serviceId, name: marker, durationMin: 45, price: 120000 }] },
        },
      });

    const dayVisit = await createVisit(new Date(now + 23.5 * 60 * 60 * 1000), new Date(now + 24.25 * 60 * 60 * 1000));
    const soonVisit = await createVisit(new Date(now + 20 * 60 * 1000), new Date(now + 65 * 60 * 1000));
    const pastVisit = await createVisit(new Date(now - 3 * 60 * 60 * 1000), new Date(now - 2 * 60 * 60 * 1000));

    const first = await runNotifications(db, async (message) => {
      sent.push(message.text);
    }, now);
    assert.equal(first.day, 1);
    assert.equal(first.soon, 1);
    assert.ok(first.reviews >= 1);
    assert.ok(sent.some((text) => text.startsWith("Напоминание:") && text.includes(marker)));
    assert.ok(sent.some((text) => text.startsWith("Через 30 минут") && text.includes(marker)));
    assert.ok(sent.some((text) => text.startsWith("Как прошёл визит")));

    const past = await db.booking.findUnique({ where: { id: pastVisit.id } });
    assert.equal(past?.status, "completed");
    assert.ok(past?.autoCompletedAt);
    assert.ok(past?.reviewRequestedAt);

    const before = sent.length;
    const second = await runNotifications(db, async (message) => {
      sent.push(message.text);
    }, now);
    assert.equal(second.day, 0);
    assert.equal(second.soon, 0);
    assert.equal(second.reviews, 0);
    assert.equal(sent.length, before);

    await db.booking.update({ where: { id: dayVisit.id }, data: { reminderDaySentAt: null } });
    await runNotifications(db, async () => {
      throw new Error("сеть");
    }, now);
    const retry = await db.booking.findUnique({ where: { id: dayVisit.id } });
    assert.equal(retry?.reminderDaySentAt, null);

    const review = await saveReview(db, { bookingId: pastVisit.id, rating: 5, telegramId: chatId });
    assert.equal(review.rating, 5);
    assert.equal(review.isPublic, true);
    await assert.rejects(saveReview(db, { bookingId: pastVisit.id, rating: 4, telegramId: "другой" }));
  } finally {
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { phone } });
    await db.$disconnect();
  }
});

test("задание без ключа не запускается", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "stage8-secret";
  const { buildApp } = await import("./app.js");
  const app = await buildApp();
  try {
    const denied = await app.inject({ method: "POST", url: "/internal/notifications" });
    assert.equal(denied.statusCode, 401);
    const allowed = await app.inject({
      method: "POST",
      url: "/internal/notifications",
      headers: { "x-cron-secret": "wrong" },
    });
    assert.equal(allowed.statusCode, 401);
  } finally {
    process.env.CRON_SECRET = previous;
    await app.close();
  }
});
