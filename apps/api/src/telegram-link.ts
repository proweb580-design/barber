export function botUsername() {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  return username || null;
}

export function telegramBookingLink(manageToken: string) {
  const username = botUsername();
  if (!username) return null;
  return `https://t.me/${username}?start=b_${manageToken}`;
}

export function telegramBarberLink(code: string) {
  const username = botUsername();
  if (!username) return null;
  return `https://t.me/${username}?start=barber_${code}`;
}

export function bookPageUrl() {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/book`;
}
