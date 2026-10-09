export const SALON_TIMEZONE = "Asia/Tashkent";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function atSalonNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00+05:00`);
}

export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SALON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysIso(isoDate: string, days: number): string {
  const date = atSalonNoon(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return todayIso(date);
}

export function upcomingDates(count = 14, now = new Date()): string[] {
  const start = todayIso(now);
  return Array.from({ length: count }, (_, index) => addDaysIso(start, index));
}

export function weekdayInTashkent(isoDate: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: SALON_TIMEZONE,
    weekday: "short",
  }).format(atSalonNoon(isoDate));

  return WEEKDAYS.indexOf(label as (typeof WEEKDAYS)[number]);
}

export function formatWeekday(isoDate: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: SALON_TIMEZONE,
    weekday: "short",
  }).format(atSalonNoon(isoDate));
}

export function formatMonthShort(isoDate: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: SALON_TIMEZONE,
    month: "short",
  }).format(atSalonNoon(isoDate));
}

export function formatSalonTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: SALON_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatSalonDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: SALON_TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: SALON_TIMEZONE,
    day: "numeric",
    month: "long",
  }).format(atSalonNoon(isoDate));
}
