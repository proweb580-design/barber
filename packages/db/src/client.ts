import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export function createPrismaClient(connectionString?: string) {
  const url = connectionString ?? process.env.DATABASE_URL ?? process.env.DIRECT_URL;

  if (!url) {
    throw new Error("Set DATABASE_URL before using the database");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

export { PrismaClient };
