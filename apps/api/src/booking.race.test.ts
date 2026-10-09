import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { config } from "dotenv";
import { createPrismaClient } from "db";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const phone = "+998901110099";
const serviceId = "10000000-0000-4000-8000-000000000001";
const barberId = "20000000-0000-4000-8000-000000000001";

test("два параллельных запроса на один слот: один 201 и один 409", async (t) => {
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    t.skip("нет DATABASE_URL");
    return;
  }

  const { buildApp } = await import("./app.js");
  const db = createPrismaClient();
  const app = await buildApp();

  try {
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { phone } });

    const days = await app.inject({
      method: "GET",
      url: `/api/v1/availability/days?serviceIds=${serviceId}&barberId=${barberId}`,
    });
    assert.equal(days.statusCode, 200);
    const open = (days.json() as { days: { date: string; available: boolean }[] }).days.find((day) => day.available);
    assert.ok(open, "нет свободного дня");

    const slots = await app.inject({
      method: "GET",
      url: `/api/v1/availability?serviceIds=${serviceId}&barberId=${barberId}&date=${open.date}`,
    });
    const slot = (slots.json() as { slots: string[] }).slots[0];
    assert.ok(slot, "нет свободного слота");
    const startsAt = new Date(`${open.date}T${slot}:00+05:00`).toISOString();
    const payload = {
      serviceIds: [serviceId],
      barberId,
      startsAt,
      client: { name: "Гонка", phone },
    };

    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/bookings", payload }),
      app.inject({ method: "POST", url: "/api/v1/bookings", payload }),
    ]);
    const codes = [first.statusCode, second.statusCode].sort();
    assert.deepEqual(codes, [201, 409]);
    const conflict = first.statusCode === 409 ? first.json() : second.json();
    assert.equal((conflict as { error: { code: string } }).error.code, "SLOT_TAKEN");
  } finally {
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { phone } });
    await db.$disconnect();
    await app.close();
  }
});

test("повтор того же слота возвращает 409, а не ошибку графика", async (t) => {
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    t.skip("нет DATABASE_URL");
    return;
  }

  const { buildApp } = await import("./app.js");
  const db = createPrismaClient();
  const app = await buildApp();
  const repeatPhone = "+998901110066";

  try {
    await db.booking.deleteMany({ where: { client: { phone: { in: [repeatPhone, "+998901110088", "+998901110077"] } } } });
    await db.client.deleteMany({ where: { phone: { in: [repeatPhone, "+998901110088", "+998901110077"] } } });

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
      client: { name: "Повтор", phone: repeatPhone },
    };
    const first = await app.inject({ method: "POST", url: "/api/v1/bookings", payload });
    const second = await app.inject({ method: "POST", url: "/api/v1/bookings", payload });
    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 409);
    assert.equal((second.json() as { error: { code: string } }).error.code, "SLOT_TAKEN");
  } finally {
    await db.booking.deleteMany({ where: { client: { phone: { in: [repeatPhone, "+998901110088", "+998901110077"] } } } });
    await db.client.deleteMany({ where: { phone: { in: [repeatPhone, "+998901110088", "+998901110077"] } } });
    await db.$disconnect();
    await app.close();
  }
});
