import type { PrismaClient } from "db";

type Db = PrismaClient;
type NoticeKind = "created" | "cancelled" | "rescheduled";

type Sender = (chatId: string, text: string) => Promise<void>;

let sender: Sender | null = null;

export function setNoticeSender(next: Sender | null) {
  sender = next;
}

function formatWhen(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function safeError(error: unknown) {
  const text = error instanceof Error ? error.message : "Не удалось отправить сообщение";
  return text.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<hidden>");
}

export async function notifyBooking(db: Db, bookingId: string, kind: NoticeKind) {
  if (!sender) return;
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      barber: { select: { name: true, telegramChatId: true } },
      client: { select: { name: true, phone: true, telegramChatId: true } },
      services: { select: { name: true } },
    },
  });
  if (!booking) return;

  const details = [
    formatWhen(booking.startsAt),
    booking.services.map((service) => service.name).join(", "),
    booking.barber.name,
  ].join("\n");
  const clientText =
    kind === "created"
      ? `Вы записаны в Кромку.\n${details}`
      : kind === "cancelled"
        ? `Запись отменена.\n${details}`
        : `Запись перенесена.\n${details}`;
  const barberText =
    kind === "created"
      ? `Новая запись.\n${booking.client.name}, ${booking.client.phone}\n${details}`
      : kind === "cancelled"
        ? `Запись отменена.\n${booking.client.name}, ${booking.client.phone}\n${details}`
        : `Запись перенесена.\n${booking.client.name}, ${booking.client.phone}\n${details}`;

  const messages = [
    booking.client.telegramChatId ? { chatId: booking.client.telegramChatId, text: clientText } : null,
    booking.barber.telegramChatId && booking.barber.telegramChatId !== booking.client.telegramChatId
      ? { chatId: booking.barber.telegramChatId, text: barberText }
      : null,
  ].filter((item) => item !== null);

  for (const message of messages) {
    try {
      await sender(message.chatId, message.text);
    } catch (error) {
      console.error(safeError(error));
    }
  }
}
