import type { PrismaClient } from "db";
import { ApiError } from "./errors.js";
import {
  dayBounds,
  dayText,
  reviewCutoff,
  reviewKeyboard,
  reviewText,
  soonBounds,
  soonText,
} from "../../../supabase/functions/notifications/windows.js";

type Db = PrismaClient;

export type Outbound = {
  chatId: string;
  text: string;
  replyMarkup?: ReturnType<typeof reviewKeyboard>;
};

type Visit = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  client: { telegramChatId: string | null };
  barber: { name: string };
  services: { name: string }[];
};

const bookingVisit = {
  client: { select: { telegramChatId: true } },
  barber: { select: { name: true } },
  services: { select: { name: true } },
} as const;

function servicesOf(visit: Visit) {
  return visit.services.map((service) => service.name).join(", ");
}

async function settingNumber(db: Db, key: string, fallback: number) {
  const row = await db.setting.findUnique({ where: { key } });
  const value = Number(row?.value);
  return Number.isFinite(value) ? value : fallback;
}

async function claim(db: Db, id: string, field: "reminderDaySentAt" | "reminder30mSentAt" | "reviewRequestedAt", now: Date) {
  const updated = await db.booking.updateMany({
    where: { id, [field]: null },
    data: { [field]: now },
  });
  return updated.count === 1;
}

async function release(db: Db, id: string, field: "reminderDaySentAt" | "reminder30mSentAt" | "reviewRequestedAt") {
  await db.booking.update({ where: { id }, data: { [field]: null } });
}

async function deliver(
  db: Db,
  visit: Visit,
  field: "reminderDaySentAt" | "reminder30mSentAt" | "reviewRequestedAt",
  now: Date,
  message: Outbound,
  send: (message: Outbound) => Promise<void>,
) {
  const chatId = visit.client.telegramChatId;
  if (!chatId) return false;
  if (!(await claim(db, visit.id, field, now))) return false;
  try {
    await send({ ...message, chatId });
    return true;
  } catch {
    await release(db, visit.id, field);
    return false;
  }
}

export async function runNotifications(db: Db, send: (message: Outbound) => Promise<void>, now = Date.now()) {
  const [dayMinutes, shortMinutes, reviewDelayMin] = await Promise.all([
    settingNumber(db, "reminder_day_minutes", 1440),
    settingNumber(db, "reminder_short_minutes", 30),
    settingNumber(db, "review_delay_min", 60),
  ]);
  const stamp = new Date(now);
  const day = dayBounds(now, dayMinutes);
  const soon = soonBounds(now, shortMinutes);
  let daySent = 0;
  let soonSent = 0;
  let reviews = 0;

  const dayVisits = await db.booking.findMany({
    where: {
      status: "confirmed",
      reminderDaySentAt: null,
      startsAt: { gt: day.after, lte: day.until },
      client: { telegramChatId: { not: null } },
    },
    include: bookingVisit,
  });
  for (const visit of dayVisits) {
    if (await deliver(db, visit, "reminderDaySentAt", stamp, { chatId: "", text: dayText(visit.startsAt, servicesOf(visit), visit.barber.name) }, send)) {
      daySent += 1;
    }
  }

  const soonVisits = await db.booking.findMany({
    where: {
      status: "confirmed",
      reminder30mSentAt: null,
      startsAt: { gt: soon.after, lte: soon.until },
      client: { telegramChatId: { not: null } },
    },
    include: bookingVisit,
  });
  for (const visit of soonVisits) {
    if (await deliver(db, visit, "reminder30mSentAt", stamp, { chatId: "", text: soonText(visit.startsAt, servicesOf(visit), visit.barber.name) }, send)) {
      soonSent += 1;
    }
  }

  const completed = await db.booking.updateMany({
    where: { status: "confirmed", endsAt: { lt: stamp }, autoCompletedAt: null },
    data: { status: "completed", autoCompletedAt: stamp },
  });

  const reviewVisits = await db.booking.findMany({
    where: {
      status: "completed",
      reviewRequestedAt: null,
      endsAt: { lte: reviewCutoff(now, reviewDelayMin) },
      client: { telegramChatId: { not: null } },
    },
    include: bookingVisit,
  });
  for (const visit of reviewVisits) {
    if (
      await deliver(
        db,
        visit,
        "reviewRequestedAt",
        stamp,
        { chatId: "", text: reviewText(visit.barber.name), replyMarkup: reviewKeyboard(visit.id) },
        send,
      )
    ) {
      reviews += 1;
    }
  }

  return { day: daySent, soon: soonSent, completed: completed.count, reviews };
}

export async function saveReview(db: Db, input: { bookingId: string; rating: number; telegramId: string }) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ApiError(422, "VALIDATION", "Оценка от 1 до 5");
  }
  const booking = await db.booking.findUnique({ where: { id: input.bookingId }, include: { client: true } });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
  const owner = booking.client.telegramId === input.telegramId || booking.client.telegramChatId === input.telegramId;
  if (!owner) throw new ApiError(403, "FORBIDDEN", "Это не ваша запись");
  const minimum = await settingNumber(db, "review_public_min_rating", 4);
  const isPublic = input.rating >= minimum;
  return db.review.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      barberId: booking.barberId,
      clientId: booking.clientId,
      rating: input.rating,
      isPublic,
    },
    update: { rating: input.rating, isPublic },
  });
}
