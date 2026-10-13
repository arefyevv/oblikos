import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { Prisma } from "@/generated/prisma/client";
import { generateCharacterText } from "@/features/ai/generation";
import type { AIProvider } from "@/features/ai/types";
import { reserveGeneration, GenerationSafetyError } from "@/features/ai/safety";
import { AIError } from "@/features/ai/types";
import { operationLog } from "@/lib/server/logging";
import { generationSchema, bodySchema } from "./validation";

export class ContentUnavailable extends Error { constructor() { super("ContentUnavailable"); } }
export class ContentBusy extends Error { constructor() { super("Запрос уже выполняется. Дождитесь результата и обновите страницу."); } }
export class ContentFailed extends Error { constructor() { super("Этот запрос завершился ошибкой. Проверьте контент перед новой генерацией."); } }
export class ContentConflict extends Error { constructor() { super("Текст изменился во время операции. Обновите страницу перед повторной попыткой."); } }
export class ArchivedCharacter extends Error { constructor() { super("Восстановите персонажа из архива перед генерацией."); } }
type Context = { userId: string; workspaceId: string };
const include = { character: { select: { id: true, name: true, status: true, voice: true } } } as const;
export type ContentRecord = Prisma.ContentGetPayload<{ include: typeof include }>;

function writeConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  if (!(error instanceof Error) || !("cause" in error)) return false;
  const cause = error.cause;
  return typeof cause === "object" && cause !== null && "originalCode" in cause && ["40001", "40P01"].includes(String(cause.originalCode));
}
function validId(id: string) { if (!z.uuid().safeParse(id).success) throw new ContentUnavailable(); }

export function createContentService(resolveContext: () => Promise<Context>, provider: AIProvider) {
  async function scoped<T>(context: Context, work: (tx: Prisma.TransactionClient, where: Prisma.ContentWhereInput) => Promise<T>, write = false): Promise<T> {
    validId(context.userId); validId(context.workspaceId);
    for (let attempt = 0; ; attempt++) {
      try {
        return await getDatabase().$transaction(async (tx) => {
          if (!await tx.workspaceMember.findUnique({ where: { workspaceId_userId: context } })) throw new ContentUnavailable();
          return work(tx, { workspaceId: context.workspaceId, character: { workspaceId: context.workspaceId, deletedAt: null } });
        }, { isolationLevel: write ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.ReadCommitted });
      } catch (error) {
        if (writeConflict(error) && attempt < 4) { await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt)); continue; }
        throw error;
      }
    }
  }
  async function find(tx: Prisma.TransactionClient, where: Prisma.ContentWhereInput, id: string) {
    validId(id);
    const entry = await tx.content.findFirst({ where: { ...where, id }, include });
    if (!entry) throw new ContentUnavailable();
    return entry;
  }
  async function writableCharacter(tx: Prisma.TransactionClient, context: Context, characterId: string) {
    validId(characterId);
    const character = await tx.character.findFirst({ where: { id: characterId, workspaceId: context.workspaceId, deletedAt: null } });
    if (!character) throw new ContentUnavailable();
    if (character.status === "ARCHIVED") throw new ArchivedCharacter();
  }
  async function generate(input: unknown, requestId: string, targetId?: string) {
    const context = await resolveContext();
    validId(requestId);
    const source = targetId ? await scoped(context, (tx, where) => find(tx, where, targetId)) : undefined;
    const request = generationSchema.parse(source ? { characterId: source.characterId, type: source.type, instruction: source.instruction } : input);
    const fingerprint = createHash("sha256").update(JSON.stringify({ request, targetId: targetId || null })).digest("hex");
    // Claim before the slow provider request, outside a long-running transaction.
    // PK uniqueness also protects concurrent requests from different app processes.
    try {
      await scoped(context, async (tx) => {
        await writableCharacter(tx, context, request.characterId);
        await tx.contentGeneration.create({ data: { id: requestId, workspaceId: context.workspaceId, characterId: request.characterId, fingerprint } });
      }, true);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      return scoped(context, async (tx, where) => {
        await writableCharacter(tx, context, request.characterId);
        const receipt = await tx.contentGeneration.findFirst({ where: { id: requestId, workspaceId: context.workspaceId, characterId: request.characterId, fingerprint } });
        if (!receipt) throw new ContentUnavailable();
        if (receipt.failed) throw new ContentFailed();
        if (!receipt.contentId) throw new ContentBusy();
        return find(tx, where, receipt.contentId);
      });
    }
    const started = Date.now();
    try {
      await reserveGeneration("text", context);
      const result = await generateCharacterText(context, request, provider);
      const saved = await scoped(context, async (tx, where) => {
        await writableCharacter(tx, context, request.characterId);
        let content: ContentRecord;
        if (source) {
          const current = await find(tx, where, source.id);
          if (current.updatedAt.getTime() !== source.updatedAt.getTime()) throw new ContentConflict();
          content = await tx.content.update({ where: { ...where, id: source.id }, data: result, include });
        } else {
          content = await tx.content.create({ data: { ...request, ...result, workspaceId: context.workspaceId }, include });
        }
        await tx.contentGeneration.update({ where: { id: requestId }, data: { contentId: content.id } });
        return content;
      }, true);
      operationLog("completed", "text", { requestId, durationMs: Date.now() - started });
      return saved;
    } catch (error) {
      // A timeout/lost commit acknowledgement can still have incurred a charge.
      // Never remove the receipt or replay a provider call for this UUID.
      await getDatabase().contentGeneration.updateMany({ where: { id: requestId, workspaceId: context.workspaceId, contentId: null }, data: { failed: true } }).catch(() => undefined);
      operationLog("failed", "text", { requestId, durationMs: Date.now() - started, code: error instanceof AIError || error instanceof GenerationSafetyError ? error.code : "operation" });
      throw error;
    }
  }
  return {
    list: async (characterId?: string, take = 100) => {
      const context = await resolveContext();
      if (characterId) validId(characterId);
      z.number().int().min(1).max(100).parse(take);
      return scoped(context, async (tx, where) => {
        if (characterId && !await tx.character.findFirst({ where: { id: characterId, workspaceId: context.workspaceId, deletedAt: null } })) throw new ContentUnavailable();
        const filter = { ...where, ...(characterId ? { characterId } : {}) };
        const entries = await tx.content.findMany({ where: filter, include, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take });
        return { entries, total: await tx.content.count({ where: filter }) };
      });
    },
    get: async (id: string) => scoped(await resolveContext(), (tx, where) => find(tx, where, id)),
    generate: (input: unknown, requestId: string) => generate(input, requestId),
    regenerate: (id: string, requestId: string) => generate(undefined, requestId, id),
    update: async (id: string, input: unknown, expectedUpdatedAt: string) => {
      const context = await resolveContext();
      const data = bodySchema.parse(input);
      const expected = z.iso.datetime().parse(expectedUpdatedAt);
      return scoped(context, async (tx, where) => {
        const current = await find(tx, where, id);
        if (current.updatedAt.toISOString() !== expected) throw new ContentConflict();
        return tx.content.update({ where: { ...where, id }, data: { body: data.body, ...(data.voiceOverride !== undefined ? { voiceOverride: data.voiceOverride || {} } : {}) }, include });
      }, true);
    },
    delete: async (id: string) => scoped(await resolveContext(), async (tx, where) => {
      await find(tx, where, id);
      return tx.content.delete({ where: { ...where, id } });
    }, true),
  };
}
