export function formatPrice(amount: number) {
  return `${new Intl.NumberFormat("ru-RU").format(amount)} сум`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatWeekday(date: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", weekday: "short" }).format(
    new Date(`${date}T12:00:00+05:00`),
  );
}

export function formatMonth(date: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", month: "short" }).format(
    new Date(`${date}T12:00:00+05:00`),
  );
}

export function normalizePhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("998") && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  return input.trim();
}

export function isValidPhone(input: string) {
  return /^\+998\d{9}$/.test(normalizePhone(input));
}

export function isValidName(input: string) {
  return /^[\p{L}][\p{L}\s'-]{1,40}$/u.test(input.trim());
}

export function statusLabel(status: string) {
  if (status === "confirmed") return "Подтверждена";
  if (status === "cancelled") return "Отменена";
  if (status === "completed") return "Завершена";
  if (status === "no_show") return "Не пришёл";
  return status;
}
