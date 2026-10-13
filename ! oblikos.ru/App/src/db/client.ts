import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrlSchema } from "@/lib/validation/env";

const databaseGlobal = globalThis as typeof globalThis & {
  oblikOsPrisma?: PrismaClient;
};

// Ленивая инициализация: build не требует DATABASE_URL или живой БД.
export function getDatabase(): PrismaClient {
  if (databaseGlobal.oblikOsPrisma) return databaseGlobal.oblikOsPrisma;

  const result = databaseUrlSchema.safeParse(process.env.DATABASE_URL);
  if (!result.success) {
    throw new Error("Настройте корректный DATABASE_URL перед обращением к БД.");
  }

  const adapter = new PrismaPg({
    connectionString: result.data,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  const database = new PrismaClient({ adapter });
  databaseGlobal.oblikOsPrisma = database;
  return database;
}
