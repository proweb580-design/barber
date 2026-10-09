import { createPrismaClient, type PrismaClient } from "db";

let client: PrismaClient | undefined;

export function prisma(): PrismaClient {
  if (!client) {
    client = createPrismaClient();
  }
  return client;
}
