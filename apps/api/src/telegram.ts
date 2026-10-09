import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors.js";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type TelegramUser = {
  id: string;
  name: string;
};

export function verifyInitData(initData: string, botToken: string, now = Date.now()): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new ApiError(401, "INIT_DATA_INVALID", "Подпись Telegram отсутствует");
  }

  const dataCheck = [...params.keys()]
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${params.get(key)}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest();
  const actual = Buffer.from(hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ApiError(401, "INIT_DATA_INVALID", "Подпись Telegram не совпала");
  }

  const authDate = Number(params.get("auth_date"));
  const authMs = authDate * 1000;
  if (!Number.isFinite(authDate) || now - authMs > MAX_AGE_MS || authMs - now > 60_000) {
    throw new ApiError(401, "INIT_DATA_EXPIRED", "Сессия Telegram устарела. Откройте приложение заново");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new ApiError(401, "INIT_DATA_INVALID", "В initData нет пользователя");
  let user: { id?: number | string; first_name?: string; last_name?: string };
  try {
    user = JSON.parse(rawUser) as { id?: number | string; first_name?: string; last_name?: string };
  } catch {
    throw new ApiError(401, "INIT_DATA_INVALID", "Пользователь Telegram не читается");
  }
  if (user.id == null || user.id === "") {
    throw new ApiError(401, "INIT_DATA_INVALID", "В initData нет пользователя");
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Гость";
  return { id: String(user.id), name };
}

export function telegramUserFrom(initData: string | undefined) {
  const value = initData?.trim();
  if (!value) return null;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new ApiError(503, "TELEGRAM_NOT_CONFIGURED", "На сервере нет TELEGRAM_BOT_TOKEN");
  }
  return verifyInitData(value, token);
}
