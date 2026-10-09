import { randomBytes } from "node:crypto";
import type { PrismaClient } from "db";
import { z } from "zod";
import { linkClientTelegram, listClientBookings } from "./booking.js";
import { ApiError } from "./errors.js";
import { bookPageUrl, telegramBarberLink } from "./telegram-link.js";

type Db = PrismaClient;

export type BotReply = { text: string; menu?: boolean };

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function parseStartPayload(text: string) {
  const match = text.trim().match(/^\/start(?:@\w+)?(?:\s+(\S+))?/i);
  return match?.[1] ?? "";
}

export async function createBarberLink(db: Db, barberId: string, now = Date.now()) {
  const barber = await db.barber.findUnique({ where: { id: barberId } });
  if (!barber?.isActive) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
  const code = randomBytes(9).toString("base64url");
  const expiresAt = new Date(now + 24 * 60 * 60 * 1000);
  await db.barberLink.create({ data: { code, barberId, expiresAt } });
  return { code, expiresAt: expiresAt.toISOString(), link: telegramBarberLink(code) };
}

async function claimBarber(db: Db, code: string, chatId: string): Promise<BotReply> {
  const link = await db.barberLink.findUnique({ where: { code }, include: { barber: true } });
  if (!link || link.usedAt || link.expiresAt.getTime() <= Date.now()) {
    return { text: "Ссылка привязки недействительна или уже использована." };
  }
  const claimed = await db.barberLink.updateMany({
    where: { code, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return { text: "Ссылка привязки недействительна или уже использована." };
  await db.barber.update({ where: { id: link.barberId }, data: { telegramChatId: chatId } });
  return { text: `Вы привязаны как ${link.barber.name}. Новые записи будут приходить сюда.` };
}

async function linkBooking(db: Db, token: string, telegramId: string, chatId: string): Promise<BotReply> {
  if (!z.uuid().safeParse(token).success) return { text: "Ссылка записи повреждена." };
  const booking = await db.booking.findUnique({
    where: { manageToken: token },
    include: { barber: true, services: true },
  });
  if (!booking) return { text: "Запись не найдена." };
  try {
    await linkClientTelegram(db, booking.clientId, telegramId, chatId);
  } catch (error) {
    if (error instanceof ApiError) return { text: error.message };
    throw error;
  }
  const services = booking.services.map((service) => service.name).join(", ");
  return {
    text: `Запись привязана. Сообщения об изменениях будут приходить сюда.\n${formatWhen(booking.startsAt.toISOString())}\n${services}\n${booking.barber.name}`,
  };
}

export async function bookingsText(db: Db, telegramId: string) {
  const mine = await listClientBookings(db, telegramId);
  const upcoming = mine.bookings.filter((booking) => booking.status === "confirmed");
  if (upcoming.length === 0) return `Записей пока нет. Записаться: ${bookPageUrl()}`;
  return upcoming
    .map((booking) => `${formatWhen(booking.startsAt)}\n${booking.services.map((service) => service.name).join(", ")}\n${booking.barber.name}`)
    .join("\n\n");
}

export async function handleStart(db: Db, input: { telegramId: string; chatId: string; firstName: string; payload: string }): Promise<BotReply> {
  if (input.payload.startsWith("b_")) return linkBooking(db, input.payload.slice(2), input.telegramId, input.chatId);
  if (input.payload.startsWith("barber_")) return claimBarber(db, input.payload.slice("barber_".length), input.chatId);
  if (input.payload) return { text: "Не понял ссылку. Откройте запись с сайта ещё раз." };
  const name = input.firstName.trim() || "гость";
  return { text: `Здравствуйте, ${name}. Здесь Кромка: запись и сообщения об изменениях.`, menu: true };
}
