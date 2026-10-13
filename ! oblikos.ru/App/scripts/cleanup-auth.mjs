import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { databaseUrlSchema } from "../src/lib/validation/env.ts";

const client = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrlSchema.parse(process.env.DATABASE_URL),
    max: 1,
  }),
});
try {
  const now = new Date();
  const results = await client.$transaction([
    client.authSession.deleteMany({ where: { expiresAt: { lte: now } } }),
    client.authToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    client.accountLinkIntent.deleteMany({ where: { expiresAt: { lte: now } } }),
    client.authRateLimit.deleteMany({ where: { expiresAt: { lte: now } } }),
    client.voicePreview.updateMany({ where: { expiresAt: { lte: now }, audio: { not: null } }, data: { audio: null } }),
  ]);
  console.log(
    `Очищено истёкших auth-записей и аудиообразцов: ${results.reduce((total, result) => total + result.count, 0)}.`,
  );
} catch {
  console.error("Не удалось очистить истёкшие auth-записи.");
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
