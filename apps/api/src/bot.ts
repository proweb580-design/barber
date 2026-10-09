import { Bot, InlineKeyboard } from "grammy";
import { bookingsText, handleStart, parseStartPayload } from "./bot-flow.js";
import { prisma } from "./db.js";
import { ApiError } from "./errors.js";
import { saveReview } from "./reminders.js";
import { bookPageUrl } from "./telegram-link.js";

let bot: Bot | null = null;

export function getBot() {
  return bot;
}

export function initBot(token: string | undefined) {
  if (!token || !/^\d+:[\w-]{10,}$/.test(token)) {
    bot = null;
    return null;
  }
  bot = createBot(token);
  return bot;
}

const knownBot = {
  id: 1,
  is_bot: true as const,
  first_name: "Кромка",
  username: "kromka_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

function menuKeyboard() {
  const keyboard = new InlineKeyboard();
  const miniapp = process.env.MINIAPP_URL;
  if (miniapp?.startsWith("https://")) keyboard.webApp("Записаться", miniapp);
  else keyboard.url("Записаться", bookPageUrl());
  keyboard.row().text("Мои записи", "bookings");
  return keyboard;
}

function createBot(token: string) {
  const next = new Bot(token, { botInfo: knownBot });

  next.command("start", async (ctx) => {
    if (!ctx.chat || ctx.chat.type !== "private" || !ctx.from) return;
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : parseStartPayload(ctx.message?.text ?? "");
    const reply = await handleStart(prisma(), {
      telegramId: String(ctx.from.id),
      chatId: String(ctx.chat.id),
      firstName: ctx.from.first_name,
      payload,
    });
    await ctx.reply(reply.text, reply.menu ? { reply_markup: menuKeyboard() } : undefined);
  });

  next.command("book", async (ctx) => {
    await ctx.reply("Запись на сайте.", { reply_markup: menuKeyboard() });
  });

  next.command("bookings", async (ctx) => {
    if (!ctx.from) return;
    await ctx.reply(await bookingsText(prisma(), String(ctx.from.id)));
  });

  next.callbackQuery("bookings", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.from) return;
    await ctx.reply(await bookingsText(prisma(), String(ctx.from.id)));
  });

  next.callbackQuery(/^review:/, async (ctx) => {
    const [, bookingId, ratingText] = (ctx.callbackQuery.data ?? "").split(":");
    if (!ctx.from || !bookingId) return;
    try {
      await saveReview(prisma(), { bookingId, rating: Number(ratingText), telegramId: String(ctx.from.id) });
      await ctx.answerCallbackQuery({ text: "Оценку сохранили" });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Не удалось сохранить оценку";
      await ctx.answerCallbackQuery({ text });
    }
  });

  next.catch((error) => {
    console.error(error.error instanceof Error ? error.error.message : "telegram");
  });

  return next;
}

export async function handleWebhookUpdate(update: unknown) {
  const current = getBot();
  if (!current) return false;
  await current.handleUpdate(update as Parameters<Bot["handleUpdate"]>[0]);
  return true;
}

export async function configureBot(current: Bot) {
  await current.api.setMyCommands([
    { command: "start", description: "Начать" },
    { command: "book", description: "Записаться" },
    { command: "bookings", description: "Мои записи" },
  ]);
  const miniapp = process.env.MINIAPP_URL;
  if (miniapp?.startsWith("https://")) {
    await current.api.setChatMenuButton({
      menu_button: { type: "web_app", text: "Записаться", web_app: { url: miniapp } },
    });
    return;
  }
  await current.api.setChatMenuButton({ menu_button: { type: "commands" } });
}
