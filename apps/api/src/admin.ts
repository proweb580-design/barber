import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "db";
import { loadSettings, toView } from "./booking.js";
import { ApiError } from "./errors.js";
import { salonMidnight } from "./slots.js";

type Db = PrismaClient;
const DAY_MS = 24 * 60 * 60 * 1000;
const uploadsDir = path.resolve(import.meta.dirname, "../../../apps/web/public/uploads");

export const SETTING_KEYS = [
  "cancel_cutoff_min",
  "slot_step_min",
  "booking_horizon_days",
  "min_notice_min",
  "reminder_day_minutes",
  "reminder_short_minutes",
  "review_delay_min",
  "timezone",
  "review_public_min_rating",
] as const;

const bookingInclude = {
  barber: { select: { id: true, name: true } },
  client: { select: { name: true, phone: true } },
  services: true,
} as const;

function clock(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) throw new ApiError(400, "VALIDATION", "Время укажите как ЧЧ:ММ");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new ApiError(400, "VALIDATION", "Некорректное время");
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

export function clockLabel(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function isForeignKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2003");
}

function publicImageUrl(value: string) {
  if (value.startsWith("/uploads/") && !value.includes("..")) return value;
  if (value.startsWith("https://")) return value;
  throw new ApiError(400, "VALIDATION", "Фото должно быть загружено или указано https-ссылкой");
}

const shopDays = [0, 2, 3, 4, 5, 6];

export async function listAdminBookings(db: Db, input: { from: string; to: string; status?: "confirmed" | "completed" | "cancelled" | "no_show" }) {
  if (input.to < input.from) throw new ApiError(400, "VALIDATION", "Конец периода раньше начала");
  const settings = await loadSettings(db);
  const rows = await db.booking.findMany({
    where: {
      startsAt: { gte: new Date(salonMidnight(input.from)), lt: new Date(salonMidnight(input.to) + DAY_MS) },
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { startsAt: "asc" },
    include: bookingInclude,
  });
  return rows.map((row) => ({ ...toView(row, settings.cancelCutoffMin), source: row.source }));
}

export async function listAdminServices(db: Db) {
  return db.service.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export async function saveService(
  db: Db,
  input: { name: string; description: string; durationMin: number; price: number; isActive: boolean; sortOrder: number },
  id?: string,
) {
  const data = {
    name: input.name.trim(),
    description: input.description.trim(),
    durationMin: input.durationMin,
    price: input.price,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
  if (id) {
    const existing = await db.service.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Услуга не найдена");
    return db.service.update({ where: { id }, data });
  }
  return db.service.create({ data });
}

export async function removeService(db: Db, id: string) {
  const existing = await db.service.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Услуга не найдена");
  try {
    await db.service.delete({ where: { id } });
    return { removed: true };
  } catch (error) {
    if (!isForeignKey(error)) throw error;
    await db.service.update({ where: { id }, data: { isActive: false } });
    return { removed: false };
  }
}

export async function listAdminBarbers(db: Db) {
  const rows = await db.barber.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      services: { select: { serviceId: true } },
      portfolio: { orderBy: { sortOrder: "asc" } },
      workingHours: true,
      breaks: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    bio: row.bio,
    photoUrl: row.photoUrl,
    experienceYears: row.experienceYears,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    serviceIds: row.services.map((item) => item.serviceId),
    portfolio: row.portfolio.map((item) => ({ id: item.id, imageUrl: item.imageUrl, sortOrder: item.sortOrder })),
    hours: row.workingHours.map((item) => ({ weekday: item.weekday, start: clockLabel(item.startTime), end: clockLabel(item.endTime) })),
    breaks: row.breaks.map((item) => ({ weekday: item.weekday, start: clockLabel(item.startTime), end: clockLabel(item.endTime) })),
  }));
}

export async function saveBarber(
  db: Db,
  input: {
    name: string;
    bio: string;
    photoUrl: string | null;
    experienceYears: number;
    isActive: boolean;
    sortOrder: number;
    serviceIds?: string[];
  },
  id?: string,
) {
  const photoUrl = input.photoUrl ? publicImageUrl(input.photoUrl) : null;
  const data = {
    name: input.name.trim(),
    bio: input.bio.trim(),
    photoUrl,
    experienceYears: input.experienceYears,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
  return db.$transaction(async (tx) => {
    if (id) {
      const existing = await tx.barber.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
    }
    const barber = id ? await tx.barber.update({ where: { id }, data }) : await tx.barber.create({ data });
    if (!id) {
      await tx.workingHour.createMany({
        data: shopDays.map((weekday) => ({
          barberId: barber.id,
          weekday,
          startTime: clock("10:00"),
          endTime: clock("21:00"),
        })),
      });
      await tx.break.createMany({
        data: shopDays.map((weekday) => ({
          barberId: barber.id,
          weekday,
          startTime: clock("13:00"),
          endTime: clock("14:00"),
        })),
      });
    }
    if (input.serviceIds) {
      const services = await tx.service.findMany({ where: { id: { in: input.serviceIds } }, select: { id: true } });
      if (services.length !== new Set(input.serviceIds).size) {
        throw new ApiError(422, "VALIDATION", "Одна из услуг не найдена");
      }
      await tx.barberService.deleteMany({ where: { barberId: barber.id } });
      if (input.serviceIds.length > 0) {
        await tx.barberService.createMany({
          data: [...new Set(input.serviceIds)].map((serviceId) => ({ barberId: barber.id, serviceId, isEnabled: true })),
        });
      }
    }
    return barber;
  });
}

export async function removeBarber(db: Db, id: string) {
  const existing = await db.barber.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
  try {
    await db.barber.delete({ where: { id } });
    return { removed: true };
  } catch (error) {
    if (!isForeignKey(error)) throw error;
    await db.barber.update({ where: { id }, data: { isActive: false } });
    return { removed: false };
  }
}

export async function saveSchedule(
  db: Db,
  barberId: string,
  hours: { weekday: number; start: string; end: string }[],
  breaks: { weekday: number; start: string; end: string }[],
) {
  const barber = await db.barber.findUnique({ where: { id: barberId }, select: { id: true } });
  if (!barber) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
  const hourRows = hours.map((row) => {
    const startTime = clock(row.start);
    const endTime = clock(row.end);
    if (endTime <= startTime) throw new ApiError(422, "VALIDATION", "Конец смены должен быть позже начала");
    return { barberId, weekday: row.weekday, startTime, endTime };
  });
  const breakRows = breaks.map((row) => {
    const startTime = clock(row.start);
    const endTime = clock(row.end);
    if (endTime <= startTime) throw new ApiError(422, "VALIDATION", "Конец обеда должен быть позже начала");
    const shift = hourRows.find((item) => item.weekday === row.weekday && item.startTime <= startTime && item.endTime >= endTime);
    if (!shift) throw new ApiError(422, "VALIDATION", "Обед должен попадать в рабочую смену");
    return { barberId, weekday: row.weekday, startTime, endTime };
  });
  await db.$transaction([
    db.workingHour.deleteMany({ where: { barberId } }),
    db.break.deleteMany({ where: { barberId } }),
    db.workingHour.createMany({ data: hourRows }),
    db.break.createMany({ data: breakRows }),
  ]);
}

export async function addPortfolio(db: Db, barberId: string, imageUrl: string) {
  const barber = await db.barber.findUnique({ where: { id: barberId }, select: { id: true } });
  if (!barber) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
  const count = await db.portfolioItem.count({ where: { barberId } });
  return db.portfolioItem.create({
    data: { barberId, imageUrl: publicImageUrl(imageUrl), sortOrder: count },
  });
}

export async function removePortfolio(db: Db, id: string) {
  const item = await db.portfolioItem.findUnique({ where: { id }, select: { id: true } });
  if (!item) throw new ApiError(404, "NOT_FOUND", "Фото не найдено");
  await db.portfolioItem.delete({ where: { id } });
}

export async function storeUpload(data: string) {
  if (process.env.VERCEL) {
    throw new ApiError(422, "VALIDATION", "На хостинге файл не сохраняется. Вставьте https-ссылку на фото");
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.length < 16 || bytes.length > 1_500_000) {
    throw new ApiError(422, "VALIDATION", "Фото должно быть от нескольких байт до 1,5 МБ");
  }
  const extension = imageExtension(bytes);
  await mkdir(uploadsDir, { recursive: true });
  const name = `${randomBytes(12).toString("hex")}.${extension}`;
  await writeFile(path.join(uploadsDir, name), bytes);
  return { url: `/uploads/${name}` };
}

function imageExtension(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  throw new ApiError(422, "VALIDATION", "Нужно фото JPEG, PNG или WebP");
}

export async function listTimeOff(db: Db, from: string, to: string) {
  if (to < from) throw new ApiError(400, "VALIDATION", "Конец периода раньше начала");
  const rows = await db.timeOff.findMany({
    where: {
      startsAt: { lt: new Date(salonMidnight(to) + DAY_MS) },
      endsAt: { gt: new Date(salonMidnight(from)) },
    },
    orderBy: { startsAt: "asc" },
    include: { barber: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    barberId: row.barberId,
    barberName: row.barber?.name ?? null,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    type: row.type,
    note: row.note,
  }));
}

export async function saveTimeOff(
  db: Db,
  input: { barberId: string | null; startsAt: string; endsAt: string; type: "day_off" | "vacation" | "sick" | "closure"; note: string },
  id?: string,
) {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new ApiError(400, "VALIDATION", "Конец исключения должен быть позже начала");
  }
  const barberId = input.type === "closure" ? null : input.barberId;
  if (barberId) {
    const barber = await db.barber.findUnique({ where: { id: barberId }, select: { id: true } });
    if (!barber) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
  }
  const data = { barberId, startsAt, endsAt, type: input.type, note: input.note.trim() };
  if (!id) return db.timeOff.create({ data });
  const existing = await db.timeOff.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Исключение не найдено");
  return db.timeOff.update({ where: { id }, data });
}

export async function removeTimeOff(db: Db, id: string) {
  const existing = await db.timeOff.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Исключение не найдено");
  await db.timeOff.delete({ where: { id } });
}

export async function listAdminReviews(db: Db) {
  const rows = await db.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      client: { select: { name: true } },
      barber: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    isPublic: row.isPublic,
    createdAt: row.createdAt.toISOString(),
    clientName: row.client.name,
    barberName: row.barber.name,
  }));
}

export async function setReviewPublic(db: Db, id: string, isPublic: boolean) {
  const existing = await db.review.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Отзыв не найден");
  return db.review.update({ where: { id }, data: { isPublic } });
}

export async function readSettings(db: Db) {
  const rows = await db.setting.findMany();
  const settings: Record<string, string> = {};
  for (const key of SETTING_KEYS) {
    settings[key] = rows.find((row) => row.key === key)?.value ?? "";
  }
  return settings;
}

export async function writeSettings(db: Db, input: Record<string, string>) {
  const keys = Object.keys(input);
  if (keys.some((key) => !SETTING_KEYS.includes(key as (typeof SETTING_KEYS)[number]))) {
    throw new ApiError(400, "VALIDATION", "Неизвестная настройка");
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "timezone") {
      if (!/^[A-Za-z0-9_+\-/]{1,64}$/.test(value)) throw new ApiError(400, "VALIDATION", "Некорректный часовой пояс");
    } else if (!/^\d{1,5}$/.test(value)) {
      throw new ApiError(400, "VALIDATION", "Числовые настройки укажите целым числом");
    }
  }
  await db.$transaction(
    Object.entries(input).map(([key, value]) => db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })),
  );
  return readSettings(db);
}
