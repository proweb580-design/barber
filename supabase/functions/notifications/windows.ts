export const DAY_GRACE_MIN = 60;

export function dayBounds(now: number, dayMinutes: number, graceMin = DAY_GRACE_MIN) {
  return {
    after: new Date(now + (dayMinutes - graceMin) * 60_000),
    until: new Date(now + dayMinutes * 60_000),
  };
}

export function soonBounds(now: number, shortMinutes: number) {
  return {
    after: new Date(now),
    until: new Date(now + shortMinutes * 60_000),
  };
}

export function reviewCutoff(now: number, delayMin: number) {
  return new Date(now - delayMin * 60_000);
}

export function formatWhen(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function visitLines(when: Date, services: string, barberName: string) {
  return `${formatWhen(when)}\n${services}\n${barberName}`;
}

export function dayText(when: Date, services: string, barberName: string) {
  return `Напоминание: завтра вы в Кромке.\n${visitLines(when, services, barberName)}`;
}

export function soonText(when: Date, services: string, barberName: string) {
  return `Через 30 минут ждём вас в Кромке.\n${visitLines(when, services, barberName)}`;
}

export function reviewText(barberName: string) {
  return `Как прошёл визит к ${barberName}? Поставьте оценку от 1 до 5.`;
}

export function reviewKeyboard(bookingId: string) {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5].map((rating) => ({
        text: String(rating),
        callback_data: `review:${bookingId}:${rating}`,
      })),
    ],
  };
}
