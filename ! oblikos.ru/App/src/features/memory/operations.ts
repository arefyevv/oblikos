import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { Prisma } from "@/generated/prisma/client";
import { memoryListSchema, memorySchema, retrievalSchema } from "./validation";

export class MemoryUnavailable extends Error {
  constructor() { super("MemoryUnavailable"); }
}
const orderBy = [{ isPinned: "desc" }, { importance: "desc" }, { updatedAt: "desc" }, { id: "asc" }] satisfies Prisma.MemoryEntryOrderByWithRelationInput[];
function isWriteConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  if (!(error instanceof Error) || !("cause" in error)) return false;
  const cause = error.cause;
  return typeof cause === "object" && cause !== null && "originalCode" in cause
    && (cause.originalCode === "40001" || cause.originalCode === "40P01");
}

// Resolver is supplied only by server code. No action accepts a user/workspace ID.
export function createMemoryService(resolveContext: () => Promise<{ userId: string; workspaceId: string }>) {
  async function scoped<T>(characterId: string, work: (tx: Prisma.TransactionClient, where: Prisma.MemoryEntryWhereInput) => Promise<T>, write = false) {
    const context = await resolveContext();
    if (![characterId, context.userId, context.workspaceId].every((id) => z.uuid().safeParse(id).success)) throw new MemoryUnavailable();
    for (let attempt = 0; ; attempt++) {
      try {
        return await getDatabase().$transaction(async (tx) => {
          const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: context } });
          if (!member) throw new MemoryUnavailable();
          const character = { id: characterId, workspaceId: member.workspaceId, deletedAt: null };
          if (!await tx.character.findFirst({ where: character, select: { id: true } })) throw new MemoryUnavailable();
          return work(tx, { characterId, character });
        }, { isolationLevel: write ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.ReadCommitted });
      } catch (error) {
        if (isWriteConflict(error) && attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt + Math.random() * 25));
          continue;
        }
        throw error;
      }
    }
  }
  async function find(tx: Prisma.TransactionClient, where: Prisma.MemoryEntryWhereInput, id: string) {
    if (!z.uuid().safeParse(id).success) throw new MemoryUnavailable();
    const entry = await tx.memoryEntry.findFirst({ where: { ...where, id } });
    if (!entry) throw new MemoryUnavailable();
    return entry;
  }
  return {
    list: (characterId: string, options: unknown = {}) => scoped(characterId, async (tx, where) => {
      const { type, take } = memoryListSchema.parse(options);
      const filter = { ...where, ...(type ? { type } : {}) };
      const entries = await tx.memoryEntry.findMany({ where: filter, orderBy, take });
      const total = await tx.memoryEntry.count({ where });
      const filteredTotal = type ? await tx.memoryEntry.count({ where: filter }) : total;
      return { entries, total, filteredTotal };
    }),
    get: (characterId: string, id: string) => scoped(characterId, (tx, where) => find(tx, where, id)),
    retrieve: (characterId: string, options: unknown = {}) => scoped(characterId, (tx, where) => {
      const { limit } = retrievalSchema.parse(options);
      return tx.memoryEntry.findMany({ where, orderBy, take: limit });
    }),
    create: (characterId: string, input: unknown, requestId: string = randomUUID()) => scoped(characterId, async (tx, where) => {
      const data = memorySchema.parse(input);
      const id = z.uuid().parse(requestId);
      const existing = await tx.memoryEntry.findFirst({ where: { ...where, id } });
      if (existing) return existing;
      return tx.memoryEntry.create({ data: { ...data, id, characterId } });
    }, true).catch(async (error: unknown) => {
      // Same request UUID also protects retries after a committed but lost response.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return scoped(characterId, (tx, where) => find(tx, where, requestId));
      }
      throw error;
    }),
    update: (characterId: string, id: string, input: unknown) => scoped(characterId, async (tx, where) => {
      await find(tx, where, id);
      return tx.memoryEntry.update({ where: { ...where, id }, data: memorySchema.parse(input) });
    }, true),
    pin: (characterId: string, id: string, pinned: unknown) => scoped(characterId, async (tx, where) => {
      await find(tx, where, id);
      return tx.memoryEntry.update({ where: { ...where, id }, data: { isPinned: z.boolean().parse(pinned) } });
    }, true),
    delete: (characterId: string, id: string) => scoped(characterId, async (tx, where) => {
      await find(tx, where, id);
      return tx.memoryEntry.delete({ where: { ...where, id } });
    }, true),
  };
}
