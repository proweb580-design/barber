import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError, z } from "zod";
import {
  availability,
  availabilityDays,
  cancelBooking,
  createBooking,
  getBookingByToken,
  isSlotTaken,
  listClientBookings,
  rescheduleBooking,
} from "./booking.js";
import { getBarber, listBarbers, listServices } from "./catalog.js";
import { prisma } from "./db.js";
import { ApiError, errorBody } from "./errors.js";
import { registerAdmin } from "./admin-routes.js";
import { getBot, handleWebhookUpdate, initBot } from "./bot.js";
import { runNotifications } from "./reminders.js";
import { telegramUserFrom } from "./telegram.js";

const idParams = z.object({
  id: z.uuid(),
});

const tokenParams = z.object({
  token: z.uuid(),
});

const serviceQuery = z.object({
  serviceIds: z.string().min(1),
  barberId: z.string().min(1),
});

const bookingBody = z.object({
  serviceIds: z.array(z.uuid()).min(1),
  barberId: z.union([z.uuid(), z.literal("any")]),
  startsAt: z.string().min(1),
  client: z.object({
    name: z.string().trim().regex(/^[\p{L}][\p{L}\s'-]{1,40}$/u),
    phone: z.string().regex(/^\+998\d{9}$/),
  }),
});

const rescheduleBody = z.object({
  startsAt: z.string().min(1),
});

function serviceIdsOf(value: string) {
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean);
  const parsed = z.array(z.uuid()).min(1).safeParse(ids);
  if (!parsed.success) throw new ApiError(400, "VALIDATION", "Укажите услуги");
  return parsed.data;
}

function barberIdOf(value: string) {
  if (value === "any") return value;
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiError(400, "VALIDATION", "Некорректный барбер");
  return parsed.data;
}

function originOf(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.trim();
  }
}

function allowedOrigins() {
  const values = [process.env.WEB_ORIGIN ?? "http://localhost:3000", process.env.APP_URL ?? "", process.env.MINIAPP_URL ?? "", "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"];
  return new Set(values.flatMap((value) => value.split(",")).map((item) => originOf(item)).filter(Boolean));
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 4 * 1024 * 1024 });
  initBot(process.env.TELEGRAM_BOT_TOKEN);
  const origin = allowedOrigins();

  await app.register(cors, {
    origin(requestOrigin, callback) {
      if (!requestOrigin || origin.has(requestOrigin) || requestOrigin.endsWith(".vercel.app")) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/v1/services", async () => {
    const services = await listServices(prisma());
    return { services };
  });

  app.get("/api/v1/barbers", async () => {
    const barbers = await listBarbers(prisma());
    return { barbers };
  });

  app.get("/api/v1/barbers/:id", async (request) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION", "Некорректный id барбера");
    }
    const barber = await getBarber(prisma(), params.data.id);
    if (!barber) {
      throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
    }
    return { barber };
  });

  app.get("/api/v1/availability", async (request) => {
    const query = serviceQuery.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(request.query);
    if (!query.success) throw new ApiError(400, "VALIDATION", "Укажите услуги, барбера и дату");
    return availability(prisma(), {
      serviceIds: serviceIdsOf(query.data.serviceIds),
      barberId: barberIdOf(query.data.barberId),
      date: query.data.date,
    });
  });

  app.get("/api/v1/availability/days", async (request) => {
    const query = serviceQuery.safeParse(request.query);
    if (!query.success) throw new ApiError(400, "VALIDATION", "Укажите услуги и барбера");
    return availabilityDays(prisma(), {
      serviceIds: serviceIdsOf(query.data.serviceIds),
      barberId: barberIdOf(query.data.barberId),
    });
  });

  app.post("/internal/notifications", async (request, reply) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || headerValue(request.headers["x-cron-secret"]) !== secret) {
      return reply.status(401).send(errorBody("UNAUTHORIZED", "Неверный ключ задания"));
    }
    const current = getBot();
    const result = await runNotifications(prisma(), async (message) => {
      if (!current) throw new Error("На сервере нет TELEGRAM_BOT_TOKEN");
      await current.api.sendMessage(message.chatId, message.text, message.replyMarkup ? { reply_markup: message.replyMarkup } : undefined);
    });
    return result;
  });

  app.post("/telegram/webhook", async (request, reply) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const header = headerValue(request.headers["x-telegram-bot-api-secret-token"]);
    if (secret && header !== secret) {
      return reply.status(401).send(errorBody("UNAUTHORIZED", "Неверный секрет webhook"));
    }
    if (!getBot()) {
      return reply.status(503).send(errorBody("TELEGRAM_NOT_CONFIGURED", "На сервере нет TELEGRAM_BOT_TOKEN"));
    }
    await handleWebhookUpdate(request.body);
    return { ok: true };
  });

  app.post("/api/v1/telegram/session", async (request) => {
    const body = z.object({ initData: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Нет initData");
    const user = telegramUserFrom(body.data.initData);
    if (!user) throw new ApiError(401, "INIT_DATA_INVALID", "Подпись Telegram отсутствует");
    const mine = await listClientBookings(prisma(), user.id);
    return { user, client: mine.client, bookings: mine.bookings };
  });

  app.post("/api/v1/bookings", async (request, reply) => {
    const body = bookingBody.safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Проверьте имя, телефон и выбранное время");
    const telegram = telegramUserFrom(headerValue(request.headers["x-telegram-init-data"]));
    const booking = await createBooking(prisma(), {
      ...body.data,
      source: telegram ? "telegram" : "web",
      telegramId: telegram?.id,
    });
    return reply.status(201).send({ booking });
  });

  app.get("/api/v1/bookings/:token", async (request) => {
    const params = tokenParams.safeParse(request.params);
    if (!params.success) throw new ApiError(400, "VALIDATION", "Некорректная ссылка на запись");
    const booking = await getBookingByToken(prisma(), params.data.token);
    if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
    return { booking };
  });

  app.post("/api/v1/bookings/:token/cancel", async (request) => {
    const params = tokenParams.safeParse(request.params);
    if (!params.success) throw new ApiError(400, "VALIDATION", "Некорректная ссылка на запись");
    const booking = await cancelBooking(prisma(), params.data.token);
    return { booking };
  });

  app.post("/api/v1/bookings/:token/reschedule", async (request) => {
    const params = tokenParams.safeParse(request.params);
    if (!params.success) throw new ApiError(400, "VALIDATION", "Некорректная ссылка на запись");
    const body = rescheduleBody.safeParse(request.body);
    if (!body.success) throw new ApiError(400, "VALIDATION", "Некорректное время");
    const booking = await rescheduleBooking(prisma(), params.data.token, body.data.startsAt);
    return { booking };
  });

  await registerAdmin(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.message));
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(errorBody("VALIDATION", "Проверьте запрос"));
    }
    if (isSlotTaken(error)) {
      return reply.status(409).send(errorBody("SLOT_TAKEN", "Это время уже занято"));
    }
    if (error instanceof Error && error.message.includes("DATABASE_URL")) {
      return reply.status(503).send(errorBody("DATABASE_UNAVAILABLE", "Укажите DATABASE_URL или DIRECT_URL"));
    }
    request.log.error(error);
    return reply.status(500).send(errorBody("INTERNAL", "Сервер не смог выполнить запрос"));
  });

  return app;
}
