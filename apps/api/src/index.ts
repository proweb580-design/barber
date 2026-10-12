import path from "node:path";
import { config } from "dotenv";
import Fastify from "fastify";
import { ensureAdmin } from "./admin-auth.js";
import { registerRoutes } from "./app.js";
import { getBot, installMenu } from "./bot.js";
import { prisma } from "./db.js";
import { setNoticeSender } from "./notify.js";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const app = Fastify({ logger: true, bodyLimit: 4 * 1024 * 1024 });

await registerRoutes(app);

const port = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ host: "0.0.0.0", port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

try {
  const created = await ensureAdmin(prisma());
  if (created) {
    app.log.info(`Администратор ${created} создан при старте`);
  }
} catch (error) {
  app.log.error(error);
}

const current = getBot();
if (current) {
  setNoticeSender(async (chatId, text) => {
    await current.api.sendMessage(chatId, text);
  });
  try {
    await installMenu(current);
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<hidden>") : "telegram menu";
    app.log.error(message);
  }
}

export default app;
