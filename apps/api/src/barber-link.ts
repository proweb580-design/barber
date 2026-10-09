import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { createBarberLink } = await import("./bot-flow.js");
const { prisma } = await import("./db.js");

const barberId = process.argv[2];
if (!barberId) {
  console.error("Укажите id барбера: npm run telegram:barber-link -w api -- <id>");
  process.exit(1);
}

const link = await createBarberLink(prisma(), barberId);
console.log(link.link ?? `Откройте бота и отправьте /start barber_${link.code}`);
await prisma().$disconnect();
