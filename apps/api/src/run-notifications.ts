import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { initBot, getBot } = await import("./bot.js");
const { prisma } = await import("./db.js");
const { runNotifications } = await import("./reminders.js");

initBot(process.env.TELEGRAM_BOT_TOKEN);
const bot = getBot();
const result = await runNotifications(prisma(), async (message) => {
  if (!bot) throw new Error("На сервере нет TELEGRAM_BOT_TOKEN");
  await bot.api.sendMessage(message.chatId, message.text, message.replyMarkup ? { reply_markup: message.replyMarkup } : undefined);
});
console.log(JSON.stringify(result));
await prisma().$disconnect();
