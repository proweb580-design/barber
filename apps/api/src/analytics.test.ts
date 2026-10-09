import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { config } from "dotenv";
import { createPrismaClient } from "db";
import { hashPassword, resetLoginThrottle } from "./admin-auth.js";
import { addSalonDays, weekdaySalon } from "./slots.js";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const login = "stage10-owner";
const password = "stage10-pass-word";
const phones = ["+998901770011", "+998901770012", "+998901770013", "+998901770014"];
const cutId = "10000000-0000-4000-8000-000000000001";
const beardId = "10000000-0000-4000-8000-000000000003";

function cookieFrom(header: string | string[] | undefined) {
  const line = Array.isArray(header) ? header[0] : String(header ?? "");
  return line.split(";")[0] ?? "";
}

function at(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:00`);
}

test("аналитика сходится с ручным подсчётом тестовых визитов", async (t) => {
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    t.skip("нет DATABASE_URL");
    return;
  }
  process.env.ADMIN_SESSION_SECRET ||= "stage10-test-secret";
  resetLoginThrottle();
  let date = "2030-03-01";
  while (weekdaySalon(date) !== 2) date = addSalonDays(date, 1);
  const before = addSalonDays(date, -7);

  const { buildApp } = await import("./app.js");
  const db = createPrismaClient();
  const app = await buildApp();
  let barberId = "";
  try {
    await db.adminUser.deleteMany({ where: { login } });
    await db.adminUser.create({ data: { login, passwordHash: await hashPassword(password) } });
    const barber = await db.barber.create({
      data: {
        name: "Аналитика Тест",
        experienceYears: 1,
        isActive: false,
        workingHours: {
          create: {
            weekday: 2,
            startTime: new Date(Date.UTC(1970, 0, 1, 10, 0, 0)),
            endTime: new Date(Date.UTC(1970, 0, 1, 12, 0, 0)),
          },
        },
      },
    });
    barberId = barber.id;
    const clients = await Promise.all(phones.map((phone, index) => db.client.create({ data: { name: `Гость ${index + 1}`, phone } })));
    const [returning, fresh, cancelled, missed] = clients;
    await db.booking.create({
      data: {
        clientId: returning.id,
        barberId,
        startsAt: at(before, "10:00"),
        endsAt: at(before, "10:45"),
        totalPrice: 100000,
        totalDurationMin: 45,
        status: "completed",
        source: "admin",
        services: { create: { serviceId: cutId, name: "Стрижка", durationMin: 45, price: 100000 } },
      },
    });
    await db.booking.create({
      data: {
        clientId: returning.id,
        barberId,
        startsAt: at(date, "10:00"),
        endsAt: at(date, "10:45"),
        totalPrice: 120000,
        totalDurationMin: 45,
        status: "completed",
        source: "admin",
        services: { create: { serviceId: cutId, name: "Стрижка", durationMin: 45, price: 120000 } },
      },
    });
    await db.booking.create({
      data: {
        clientId: fresh.id,
        barberId,
        startsAt: at(date, "11:00"),
        endsAt: at(date, "11:30"),
        totalPrice: 80000,
        totalDurationMin: 30,
        status: "completed",
        source: "admin",
        services: { create: { serviceId: beardId, name: "Оформление бороды", durationMin: 30, price: 80000 } },
      },
    });
    await db.booking.create({
      data: {
        clientId: cancelled.id,
        barberId,
        startsAt: at(date, "10:15"),
        endsAt: at(date, "11:00"),
        totalPrice: 50000,
        totalDurationMin: 45,
        status: "cancelled",
        source: "admin",
        services: { create: { serviceId: cutId, name: "Стрижка", durationMin: 45, price: 50000 } },
      },
    });
    await db.booking.create({
      data: {
        clientId: missed.id,
        barberId,
        startsAt: at(date, "11:30"),
        endsAt: at(date, "12:00"),
        totalPrice: 70000,
        totalDurationMin: 30,
        status: "no_show",
        source: "admin",
        services: { create: { serviceId: beardId, name: "Оформление бороды", durationMin: 30, price: 70000 } },
      },
    });

    const good = await app.inject({ method: "POST", url: "/api/v1/admin/login", payload: { login, password } });
    assert.equal(good.statusCode, 200);
    const cookie = cookieFrom(good.headers["set-cookie"]);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/admin/analytics?from=${date}&to=${date}`,
      headers: { cookie },
    });
    assert.equal(response.statusCode, 200);
    const report = response.json();
    assert.equal(report.revenue, 200000);
    assert.deepEqual(report.bookings, { total: 4, confirmed: 0, completed: 2, cancelled: 1, noShow: 1 });
    assert.deepEqual(report.services, [
      { serviceId: cutId, name: "Стрижка", count: 1, revenue: 120000 },
      { serviceId: beardId, name: "Оформление бороды", count: 1, revenue: 80000 },
    ]);
    const mine = report.load.find((row: { barberId: string }) => row.barberId === barberId);
    assert.deepEqual(mine, { barberId, name: "Аналитика Тест", availableMin: 120, bookedMin: 75, loadPercent: 62.5 });
    assert.deepEqual(report.cancellations, { count: 1, rate: 25 });
    assert.deepEqual(report.noShows, { count: 1, rate: 25 });
    assert.deepEqual(report.retention, { clients: 2, returning: 1, rate: 50 });
    const heat = report.heatmap as { weekday: number; hour: number; count: number }[];
    assert.equal(heat.find((cell) => cell.weekday === 2 && cell.hour === 10)?.count, 1);
    assert.equal(heat.find((cell) => cell.weekday === 2 && cell.hour === 11)?.count, 1);
    assert.equal(heat.find((cell) => cell.weekday === 2 && cell.hour === 11 && cell.count === 1)?.count, 1);
    assert.equal(heat.filter((cell) => cell.count > 0).length, 2);

    const revenue = await app.inject({ method: "GET", url: `/api/v1/admin/analytics/revenue?from=${date}&to=${date}`, headers: { cookie } });
    assert.equal(revenue.statusCode, 200);
    assert.equal(revenue.json().revenue, 200000);
    const denied = await app.inject({ method: "GET", url: `/api/v1/admin/analytics?from=${date}&to=${date}` });
    assert.equal(denied.statusCode, 401);
  } finally {
    resetLoginThrottle();
    if (barberId) await db.booking.deleteMany({ where: { barberId } });
    await db.client.deleteMany({ where: { phone: { in: phones } } });
    if (barberId) await db.barber.delete({ where: { id: barberId } }).catch(() => undefined);
    await db.adminUser.deleteMany({ where: { login } });
    await db.$disconnect();
    await app.close();
  }
});
