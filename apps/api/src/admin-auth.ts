import { createHmac, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type { PrismaClient } from "db";
import { ApiError } from "./errors.js";

const COOKIE = "kromka_admin";
const MAX_AGE_SEC = 60 * 60 * 24 * 14;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

type Bucket = { count: number; reset: number };

const attempts = new Map<string, Bucket>();

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new ApiError(503, "ADMIN_NOT_CONFIGURED", "На сервере нет ADMIN_SESSION_SECRET");
  return secret;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function resetLoginThrottle() {
  attempts.clear();
}

export function assertLoginAllowed(ip: string) {
  const row = attempts.get(ip);
  if (row && row.reset > Date.now() && row.count >= MAX_ATTEMPTS) {
    throw new ApiError(429, "RATE_LIMIT", "Слишком много попыток. Подождите 15 минут");
  }
}

export function noteLoginFailure(ip: string) {
  const now = Date.now();
  const row = attempts.get(ip);
  if (!row || row.reset <= now) {
    attempts.set(ip, { count: 1, reset: now + WINDOW_MS });
    return;
  }
  row.count += 1;
}

export function noteLoginSuccess(ip: string) {
  attempts.delete(ip);
}

export async function hashPassword(password: string) {
  return hash(password);
}

export async function checkPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function sessionCookie(adminId: string) {
  const payload = Buffer.from(JSON.stringify({ sub: adminId, exp: Date.now() + MAX_AGE_SEC * 1000 })).toString("base64url");
  const value = `${payload}.${sign(payload, sessionSecret())}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function adminIdFromCookie(cookieHeader: string | undefined) {
  const raw = readCookie(cookieHeader, COOKIE);
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, sessionSecret()))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    if (typeof parsed.sub !== "string" || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return parsed.sub;
  } catch {
    return null;
  }
}

export async function adminFromRequest(db: PrismaClient, cookieHeader: string | undefined) {
  const id = adminIdFromCookie(cookieHeader);
  if (!id) throw new ApiError(401, "UNAUTHORIZED", "Войдите в админку");
  const admin = await db.adminUser.findUnique({ where: { id }, select: { id: true, login: true } });
  if (!admin) throw new ApiError(401, "UNAUTHORIZED", "Войдите в админку");
  return admin;
}

export async function ensureAdmin(db: PrismaClient) {
  const login = process.env.ADMIN_LOGIN?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!login || !password) return null;
  const existing = await db.adminUser.findUnique({ where: { login }, select: { id: true } });
  if (existing) return null;
  await db.adminUser.create({ data: { login, passwordHash: await hashPassword(password) } });
  return login;
}
