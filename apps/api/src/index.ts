import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { buildApp } = await import("./app.js");
const { configureBot, getBot } = await import("./bot.js");
const { setNoticeSender } = await import("./notify.js");

const { ensureAdmin } = await import("./admin-auth.js");
const { prisma } = await import("./db.js");

const app = await buildApp();
try {
  const created = await ensureAdmin(prisma());
  if (created) app.log.info(`Администратор ${created} создан при старте`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const current = getBot();
if (current) {
  setNoticeSender(async (chatId, text) => {
    await current.api.sendMessage(chatId, text);
  });
  void configureBot(current).catch((error: unknown) => {
    const message = error instanceof Error ? error.message.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<hidden>") : "telegram menu";
    app.log.error(message);
  });
}

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
