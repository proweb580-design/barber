import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const token = process.env.TELEGRAM_BOT_TOKEN;
const publicUrl = process.env.API_PUBLIC_URL?.replace(/\/$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error("Укажите TELEGRAM_BOT_TOKEN из BotFather.");
  process.exit(1);
}
if (!publicUrl?.startsWith("https://")) {
  console.error("Укажите API_PUBLIC_URL=https://... Telegram не вызывает localhost.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${publicUrl}/telegram/webhook`,
    secret_token: secret || undefined,
    allowed_updates: ["message", "callback_query"],
  }),
});
const body = (await response.json()) as { ok?: boolean; description?: string };
if (!body.ok) {
  console.error(body.description ?? "Telegram не принял webhook");
  process.exit(1);
}
console.log("Webhook установлен.");
