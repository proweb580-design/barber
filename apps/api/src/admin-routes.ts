import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  addPortfolio,
  listAdminBarbers,
  listAdminBookings,
  listAdminReviews,
  listAdminServices,
  listTimeOff,
  readSettings,
  removeBarber,
  removePortfolio,
  removeService,
  removeTimeOff,
  saveBarber,
  saveSchedule,
  saveService,
  saveTimeOff,
  setReviewPublic,
  storeUpload,
  writeSettings,
} from "./admin.js";
import {
  adminFromRequest,
  assertLoginAllowed,
  checkPassword,
  clearSessionCookie,
  noteLoginFailure,
  noteLoginSuccess,
  sessionCookie,
} from "./admin-auth.js";
import { analyticsReport } from "./analytics.js";
import { availability, createBooking, rescheduleBookingById, setBookingStatus } from "./booking.js";
import { prisma } from "./db.js";
import { ApiError } from "./errors.js";

const dateQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clockValue = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const nameValue = z.string().trim().regex(/^[\p{L}][\p{L}\s'-]{1,40}$/u);
const phoneValue = z.string().regex(/^\+998\d{9}$/);
const statusValue = z.enum(["confirmed", "completed", "cancelled", "no_show"]);
const timeOffType = z.enum(["day_off", "vacation", "sick", "closure"]);

const serviceBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400),
  durationMin: z.number().int().min(5).max(240),
  price: z.number().int().min(0).max(10_000_000),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

const barberBody = z.object({
  name: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(600),
  photoUrl: z.string().trim().max(500).nullable(),
  experienceYears: z.number().int().min(0).max(60),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  serviceIds: z.array(z.uuid()).max(20).optional(),
});

const scheduleBody = z.object({
  hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: clockValue, end: clockValue })).max(14),
  breaks: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: clockValue, end: clockValue })).max(14),
});

const timeOffBody = z.object({
  barberId: z.uuid().nullable(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  type: timeOffType,
  note: z.string().trim().max(200),
});

async function reportOf(request: { headers: { cookie?: string | string[] }; query: unknown }) {
  await requireAdmin(request.headers.cookie);
  const query = z.object({ from: dateQuery, to: dateQuery }).safeParse(request.query);
  if (!query.success) throw new ApiError(400, "VALIDATION", "Укажите период");
  return analyticsReport(prisma(), query.data.from, query.data.to);
}

function cookieHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function requireAdmin(cookie: string | string[] | undefined) {
  return adminFromRequest(prisma(), cookieHeader(cookie));
}

export async function registerAdmin(app: FastifyInstance) {
  app.post("/api/v1/admin/login", async (request, reply) => {
    const body = z.object({ login: z.string().trim().min(1).max(64), password: z.string().min(1).max(200) }).safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Укажите логин и пароль");
    assertLoginAllowed(request.ip);
    const admin = await prisma().adminUser.findUnique({ where: { login: body.data.login } });
    const matches = admin ? await checkPassword(admin.passwordHash, body.data.password) : false;
    if (!admin || !matches) {
      noteLoginFailure(request.ip);
      throw new ApiError(401, "UNAUTHORIZED", "Неверный логин или пароль");
    }
    noteLoginSuccess(request.ip);
    reply.header("set-cookie", sessionCookie(admin.id));
    return { login: admin.login };
  });

  app.post("/api/v1/admin/logout", async (_request, reply) => {
    reply.header("set-cookie", clearSessionCookie());
    return { ok: true };
  });

  app.get("/api/v1/admin/session", async (request) => {
    const admin = await requireAdmin(request.headers.cookie);
    return { login: admin.login };
  });

  app.get("/api/v1/admin/bookings", async (request) => {
    await requireAdmin(request.headers.cookie);
    const query = z.object({ from: dateQuery, to: dateQuery, status: statusValue.optional() }).safeParse(request.query);
    if (!query.success) throw new ApiError(400, "VALIDATION", "Укажите период");
    const bookings = await listAdminBookings(prisma(), query.data);
    return { bookings };
  });

  app.post("/api/v1/admin/bookings", async (request, reply) => {
    await requireAdmin(request.headers.cookie);
    const body = z.object({
      serviceIds: z.array(z.uuid()).min(1),
      barberId: z.uuid(),
      startsAt: z.string().min(1),
      client: z.object({ name: nameValue, phone: phoneValue }),
    }).safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Проверьте клиента, услуги и время");
    const booking = await createBooking(prisma(), { ...body.data, source: "admin", staff: true });
    return reply.status(201).send({ booking });
  });

  app.patch("/api/v1/admin/bookings/:id", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({ status: statusValue.optional(), startsAt: z.string().min(1).optional() }).safeParse(request.body);
    if (!params.success || !body.success || (body.data.status === undefined && body.data.startsAt === undefined)) {
      throw new ApiError(400, "VALIDATION", "Нечего менять в записи");
    }
    const moved = body.data.startsAt ? await rescheduleBookingById(prisma(), params.data.id, body.data.startsAt) : null;
    const booking = body.data.status ? await setBookingStatus(prisma(), params.data.id, body.data.status) : moved;
    return { booking };
  });

  app.get("/api/v1/admin/availability", async (request) => {
    await requireAdmin(request.headers.cookie);
    const query = z.object({
      serviceIds: z.string().min(1),
      barberId: z.uuid(),
      date: dateQuery,
    }).safeParse(request.query);
    if (!query.success) throw new ApiError(400, "VALIDATION", "Укажите услуги, барбера и дату");
    const serviceIds = z.array(z.uuid()).min(1).safeParse(query.data.serviceIds.split(",").filter(Boolean));
    if (!serviceIds.success) throw new ApiError(400, "VALIDATION", "Укажите услуги");
    return availability(prisma(), { serviceIds: serviceIds.data, barberId: query.data.barberId, date: query.data.date, staff: true });
  });

  app.get("/api/v1/admin/services", async (request) => {
    await requireAdmin(request.headers.cookie);
    return { services: await listAdminServices(prisma()) };
  });

  app.post("/api/v1/admin/services", async (request, reply) => {
    await requireAdmin(request.headers.cookie);
    const body = serviceBody.safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Проверьте услугу");
    const service = await saveService(prisma(), body.data);
    return reply.status(201).send({ service });
  });

  app.patch("/api/v1/admin/services/:id", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = serviceBody.safeParse(request.body);
    if (!params.success || !body.success) throw new ApiError(400, "VALIDATION", "Проверьте услугу");
    return { service: await saveService(prisma(), body.data, params.data.id) };
  });

  app.delete("/api/v1/admin/services/:id", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    if (!params.success) throw new ApiError(400, "VALIDATION", "Некорректная услуга");
    return removeService(prisma(), params.data.id);
  });

  app.get("/api/v1/admin/barbers", async (request) => {
    await requireAdmin(request.headers.cookie);
    return { barbers: await listAdminBarbers(prisma()) };
  });

  app.post("/api/v1/admin/barbers", async (request, reply) => {
    await requireAdmin(request.headers.cookie);
    const body = barberBody.safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Проверьте барбера");
    const barber = await saveBarber(prisma(), body.data);
    return reply.status(201).send({ barber });
  });

  app.patch("/api/v1/admin/barbers/:id", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = barberBody.safeParse(request.body);
    if (!params.success || !body.success) throw new ApiError(400, "VALIDATION", "Проверьте барбера");
    return { barber: await saveBarber(prisma(), body.data, params.data.id) };
  });

  app.delete("/api/v1/admin/barbers/:id", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    if (!params.success) throw new ApiError(400, "VALIDATION", "Некорректный барбер");
    return removeBarber(prisma(), params.data.id);
  });

  app.put("/api/v1/admin/barbers/:id/schedule", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = scheduleBody.safeParse(request.body);
    if (!params.success || !body.success) throw new ApiError(400, "VALIDATION", "Проверьте график");
    await saveSchedule(prisma(), params.data.id, body.data.hours, body.data.breaks);
    return { ok: true };
  });

  app.post("/api/v1/admin/barbers/:id/portfolio", async (request, reply) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({ imageUrl: z.string().trim().min(1).max(500) }).safeParse(request.body);
    if (!params.success || !body.success) throw new ApiError(400, "VALIDATION", "Нужна ссылка на фото");
    const item = await addPortfolio(prisma(), params.data.id, body.data.imageUrl);
    return reply.status(201).send({ item });
  });

  app.delete("/api/v1/admin/portfolio/:id", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    if (!params.success) throw new ApiError(400, "VALIDATION", "Некорректное фото");
    await removePortfolio(prisma(), params.data.id);
    return { ok: true };
  });

  app.post("/api/v1/admin/uploads", async (request, reply) => {
    await requireAdmin(request.headers.cookie);
    const body = z.object({ data: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Файл не пришёл");
    const file = await storeUpload(body.data.data);
    return reply.status(201).send(file);
  });

  app.get("/api/v1/admin/time-off", async (request) => {
    await requireAdmin(request.headers.cookie);
    const query = z.object({ from: dateQuery, to: dateQuery }).safeParse(request.query);
    if (!query.success) throw new ApiError(400, "VALIDATION", "Укажите период");
    return { items: await listTimeOff(prisma(), query.data.from, query.data.to) };
  });

  app.post("/api/v1/admin/time-off", async (request, reply) => {
    await requireAdmin(request.headers.cookie);
    const body = timeOffBody.safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Проверьте исключение");
    const item = await saveTimeOff(prisma(), body.data);
    return reply.status(201).send({ item });
  });

  app.patch("/api/v1/admin/time-off/:id", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = timeOffBody.safeParse(request.body);
    if (!params.success || !body.success) throw new ApiError(400, "VALIDATION", "Проверьте исключение");
    return { item: await saveTimeOff(prisma(), body.data, params.data.id) };
  });

  app.delete("/api/v1/admin/time-off/:id", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    if (!params.success) throw new ApiError(400, "VALIDATION", "Некорректное исключение");
    await removeTimeOff(prisma(), params.data.id);
    return { ok: true };
  });

  app.get("/api/v1/admin/reviews", async (request) => {
    await requireAdmin(request.headers.cookie);
    return { reviews: await listAdminReviews(prisma()) };
  });

  app.patch("/api/v1/admin/reviews/:id", async (request) => {
    await requireAdmin(request.headers.cookie);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({ isPublic: z.boolean() }).safeParse(request.body);
    if (!params.success || !body.success) throw new ApiError(400, "VALIDATION", "Укажите, показывать ли отзыв");
    const review = await setReviewPublic(prisma(), params.data.id, body.data.isPublic);
    return { review: { id: review.id, isPublic: review.isPublic } };
  });

  app.get("/api/v1/admin/analytics", async (request) => reportOf(request));

  app.get("/api/v1/admin/analytics/revenue", async (request) => {
    const report = await reportOf(request);
    return { revenue: report.revenue, completed: report.bookings.completed, bookings: report.bookings };
  });

  app.get("/api/v1/admin/analytics/services", async (request) => {
    const report = await reportOf(request);
    return { services: report.services };
  });

  app.get("/api/v1/admin/analytics/load", async (request) => {
    const report = await reportOf(request);
    return { load: report.load };
  });

  app.get("/api/v1/admin/analytics/heatmap", async (request) => {
    const report = await reportOf(request);
    return { heatmap: report.heatmap };
  });

  app.get("/api/v1/admin/analytics/cancellations", async (request) => {
    const report = await reportOf(request);
    return { cancellations: report.cancellations, noShows: report.noShows };
  });

  app.get("/api/v1/admin/analytics/retention", async (request) => {
    const report = await reportOf(request);
    return { retention: report.retention };
  });

  app.get("/api/v1/admin/settings", async (request) => {
    await requireAdmin(request.headers.cookie);
    return { settings: await readSettings(prisma()) };
  });

  app.put("/api/v1/admin/settings", async (request) => {
    await requireAdmin(request.headers.cookie);
    const body = z.record(z.string(), z.string()).safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Проверьте настройки");
    return { settings: await writeSettings(prisma(), body.data) };
  });
}
