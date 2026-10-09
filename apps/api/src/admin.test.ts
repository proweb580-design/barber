import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { config } from "dotenv";
import { createPrismaClient } from "db";
import { hashPassword, resetLoginThrottle } from "./admin-auth.js";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const login = "stage9-owner";
const password = "stage9-pass-word";
const phone = "+998901990091";
const barberId = "20000000-0000-4000-8000-000000000001";
const cutId = "10000000-0000-4000-8000-000000000001";
const date = "2026-10-13";

function cookieFrom(header: string | string[] | undefined) {
  const line = Array.isArray(header) ? header[0] : String(header ?? "");
  return line.split(";")[0] ?? "";
}

test("админка: сессия, лимит входа, услуга и ручная запись", async (t) => {
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    t.skip("нет DATABASE_URL");
    return;
  }
  process.env.ADMIN_SESSION_SECRET ||= "stage9-test-secret";
  resetLoginThrottle();
  const { buildApp } = await import("./app.js");
  const db = createPrismaClient();
  const app = await buildApp();
  let serviceId = "";
  let uploadUrl = "";
  try {
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { phone } });
    await db.adminUser.deleteMany({ where: { login } });
    await db.adminUser.create({ data: { login, passwordHash: await hashPassword(password) } });

    const denied = await app.inject({ method: "GET", url: "/api/v1/admin/bookings?from=2026-10-13&to=2026-10-13" });
    assert.equal(denied.statusCode, 401);

    const bad = await app.inject({ method: "POST", url: "/api/v1/admin/login", payload: { login, password: "wrong-password" } });
    assert.equal(bad.statusCode, 401);
    resetLoginThrottle();

    const good = await app.inject({ method: "POST", url: "/api/v1/admin/login", payload: { login, password } });
    assert.equal(good.statusCode, 200);
    const cookie = cookieFrom(good.headers["set-cookie"]);
    assert.match(cookie, /^kromka_admin=/);
    assert.match(String(good.headers["set-cookie"]), /HttpOnly/);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/services",
      headers: { cookie },
      payload: { name: "Проверка админки", description: "Временная услуга", durationMin: 20, price: 1000, isActive: false, sortOrder: 99 },
    });
    assert.equal(created.statusCode, 201);
    serviceId = created.json().service.id as string;

    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const uploaded = await app.inject({
      method: "POST",
      url: "/api/v1/admin/uploads",
      headers: { cookie },
      payload: { data: png },
    });
    assert.equal(uploaded.statusCode, 201);
    uploadUrl = uploaded.json().url as string;
    assert.match(uploadUrl, /^\/uploads\/[a-f0-9]+\.png$/);

    const slots = await app.inject({
      method: "GET",
      url: `/api/v1/admin/availability?serviceIds=${cutId}&barberId=${barberId}&date=${date}`,
      headers: { cookie },
    });
    assert.equal(slots.statusCode, 200);
    const times = slots.json().slots as string[];
    assert.ok(times.length > 0);
    let bookingId = "";
    for (const time of times) {
      const booking = await app.inject({
        method: "POST",
        url: "/api/v1/admin/bookings",
        headers: { cookie },
        payload: {
          serviceIds: [cutId],
          barberId,
          startsAt: new Date(`${date}T${time}:00+05:00`).toISOString(),
          client: { name: "Проверка", phone },
        },
      });
      if (booking.statusCode === 409) continue;
      assert.equal(booking.statusCode, 201);
      bookingId = booking.json().booking.id as string;
      break;
    }
    assert.ok(bookingId);
    const cancelled = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/bookings/${bookingId}`,
      headers: { cookie },
      payload: { status: "cancelled" },
    });
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.json().booking.status, "cancelled");

    resetLoginThrottle();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await app.inject({ method: "POST", url: "/api/v1/admin/login", payload: { login, password: "wrong-password" } });
      assert.equal(response.statusCode, 401);
    }
    const limited = await app.inject({ method: "POST", url: "/api/v1/admin/login", payload: { login, password } });
    assert.equal(limited.statusCode, 429);
  } finally {
    resetLoginThrottle();
    if (serviceId) await db.service.delete({ where: { id: serviceId } }).catch(() => undefined);
    await db.booking.deleteMany({ where: { client: { phone } } });
    await db.client.deleteMany({ where: { phone } });
    await db.adminUser.deleteMany({ where: { login } });
    if (uploadUrl) {
      const { unlink } = await import("node:fs/promises");
      await unlink(path.resolve(import.meta.dirname, "../../../apps/web/public", uploadUrl.slice(1))).catch(() => undefined);
    }
    await db.$disconnect();
    await app.close();
  }
});
