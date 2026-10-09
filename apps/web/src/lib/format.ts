export function formatPrice(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(amount)} сум`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");

  if (digits.startsWith("998") && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.length === 9) {
    return `+998${digits}`;
  }

  return input.trim();
}

export function isValidPhone(input: string): boolean {
  return /^\+998\d{9}$/.test(normalizePhone(input));
}

export function isValidName(input: string): boolean {
  return /^[\p{L}][\p{L}\s'-]{1,40}$/u.test(input.trim());
}
