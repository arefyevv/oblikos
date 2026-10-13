import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { databaseUrlSchema } from "../src/lib/validation/env.ts";

const config = databaseUrlSchema.safeParse(process.env.DATABASE_URL);
if (!config.success) {
  console.error("Укажите корректный DATABASE_URL в .env.");
  process.exitCode = 1;
} else {
  const adapter = new PrismaPg({
    connectionString: config.data,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  const client = new PrismaClient({ adapter });
  try {
    const rows = await client.$queryRaw`SELECT version() AS version`;
    console.log(`PostgreSQL доступен: ${rows[0].version}`);
    const counts = await client.$transaction([
      client.user.count(),
      client.workspace.count(),
      client.workspaceMember.count(),
      client.character.count(),
      client.appearance.count(),
      client.personality.count(),
      client.memoryEntry.count(),
      client.content.count(),
      client.contentGeneration.count(),
      client.mediaAsset.count(),
      client.mediaGeneration.count(),
      client.account.count(),
      client.passwordCredential.count(),
      client.authSession.count(),
      client.authToken.count(),
      client.accountLinkIntent.count(),
      client.authRateLimit.count(),
    ]);
    console.log(
      `Prisma Client: чтение всех 17 моделей успешно; записи: ${counts.join(", ")}.`,
    );
    const constraints =
      await client.$queryRaw`SELECT indexname AS name FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN (
      'Account_provider_providerAccountId_key', 'Account_userId_provider_key',
      'PasswordCredential_userId_key', 'AuthToken_tokenHash_key',
      'AccountLinkIntent_tokenHash_key')
      UNION ALL SELECT conname AS name FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conname IN ('Account_userId_fkey',
      'PasswordCredential_userId_fkey', 'AuthSession_userId_fkey',
      'AuthToken_userId_fkey', 'AccountLinkIntent_userId_fkey')`;
    if (constraints.length !== 10)
      throw new Error("Missing authentication constraints");
    console.log("Auth: 5 unique indexes и 5 foreign keys проверены.");
    const memoryConstraints = await client.$queryRaw`SELECT indexname AS name FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'MemoryEntry'
      UNION ALL SELECT conname AS name FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conname IN ('MemoryEntry_characterId_fkey', 'MemoryEntry_importance_check', 'MemoryEntry_content_check')`;
    if (memoryConstraints.length !== 6) throw new Error("Missing memory constraints");
    console.log("Memory: primary key, 2 query indexes, foreign key и 2 CHECK constraints проверены.");
    const contentConstraints = await client.$queryRaw`SELECT indexname AS name FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ('Content', 'ContentGeneration')
      UNION ALL SELECT conname AS name FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conname IN ('Content_workspaceId_fkey', 'Content_characterId_workspaceId_fkey', 'ContentGeneration_workspaceId_fkey', 'ContentGeneration_characterId_workspaceId_fkey', 'Content_instruction_check', 'Content_body_check')`;
    if (contentConstraints.length !== 11) throw new Error("Missing content constraints");
    console.log("Content: 2 primary keys, 3 query indexes, 4 tenant foreign keys и 2 CHECK constraints проверены.");
    const mediaConstraints = await client.$queryRaw`SELECT indexname AS name FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'MediaAsset_primary_character_key'
      UNION ALL SELECT conname AS name FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conname IN ('MediaAsset_characterId_workspaceId_fkey', 'MediaGeneration_characterId_workspaceId_fkey', 'MediaAsset_primary_check', 'MediaAsset_image_check')`;
    if (mediaConstraints.length !== 5) throw new Error("Missing media constraints");
    console.log("Media: primary partial unique index, 2 tenant foreign keys и 2 CHECK constraints проверены.");
    const videoIndexes = await client.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN ('MediaGeneration_workspaceId_type_status_idx', 'MediaGeneration_referenceAssetId_status_idx')`;
    if (videoIndexes.length !== 2) throw new Error("Missing video indexes");
    const invalidReferences = await client.$queryRaw`SELECT g.id FROM "MediaGeneration" g JOIN "MediaAsset" a ON a.id = g."referenceAssetId" WHERE g.type = 'VIDEO' AND (a."workspaceId" <> g."workspaceId" OR a."characterId" <> g."characterId" OR a.type <> 'IMAGE')`;
    if (invalidReferences.length) throw new Error("Invalid video reference ownership");
    console.log("Video: 2 job indexes и tenant consistency референсов проверены.");
  } catch {
    console.error(
      "Не удалось проверить PostgreSQL, модели или auth constraints. Проверьте подключение и миграции.",
    );
    process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
}
