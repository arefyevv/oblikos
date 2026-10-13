import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/db/client";

import { Prisma } from "@/generated/prisma/client";
import { characterSchema, sectionSchemas, type CharacterSection } from "./validation";
import { maxCharacterPhotos, referencePhotoProvider } from "./photo-limits";

export class CharacterUnavailable extends Error {
  constructor() { super("CharacterUnavailable"); }
}

const include = { appearance: true, personality: true } as const;
function isWriteConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  // Prisma's pg adapter may expose a serialization failure at COMMIT directly.
  if (!(error instanceof Error) || !("cause" in error)) return false;
  const cause = error.cause;
  return typeof cause === "object" && cause !== null && "originalCode" in cause
    && (cause.originalCode === "40001" || cause.originalCode === "40P01");
}
export type CharacterRecord = Prisma.CharacterGetPayload<{ include: typeof include }>;
export type CharacterFilter = "all" | "active" | "archived";
type ReferencePhoto = Pick<Prisma.MediaAssetUncheckedCreateWithoutCharacterInput, "id" | "storageKey" | "mimeType" | "width" | "height" | "fileSize" | "provider" | "model" | "prompt" | "isPrimaryReference">;
export class CharacterPhotoLimit extends Error { constructor() { super("У персонажа может быть до 10 загруженных референсов. Удалите лишние фото в «Медиа»."); } }

// Only server code supplies this resolver. Public actions never accept identity or workspace.
// The transaction rechecks membership even when the context was resolved earlier.
export function createCharacterService(resolveContext: () => Promise<{ userId: string; workspaceId: string }>) {
  async function scoped<T>(work: (tx: Prisma.TransactionClient, where: Prisma.CharacterWhereInput, workspaceId: string) => Promise<T>, write = false) {
    const context = await resolveContext();
    if (!z.uuid().safeParse(context.userId).success || !z.uuid().safeParse(context.workspaceId).success) throw new CharacterUnavailable();
    for (let attempt = 0; ; attempt++) {
      try {
        return await getDatabase().$transaction(async (tx) => {
          const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: context } });
          if (!member) throw new CharacterUnavailable();
          return work(tx, { workspaceId: member.workspaceId, deletedAt: null }, member.workspaceId);
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
  async function find(tx: Prisma.TransactionClient, where: Prisma.CharacterWhereInput, id: string) {
    if (!z.uuid().safeParse(id).success) throw new CharacterUnavailable();
    const character = await tx.character.findFirst({ where: { ...where, id }, include });
    if (!character) throw new CharacterUnavailable();
    return character;
  }
  function slug(name: string) {
    const base = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 70) || "character";
    return `${base}-${randomUUID()}`;
  }
  return {
    hasAny: (filter: CharacterFilter = "all") => scoped(async (tx, where) => Boolean(await tx.character.findFirst({ where: { ...where, ...(filter === "active" ? { status: "ACTIVE" } : filter === "archived" ? { status: "ARCHIVED" } : {}) }, select: { id: true } }))),
    list: (filter: CharacterFilter = "all") => scoped((tx, where) => tx.character.findMany({
      where: { ...where, ...(filter === "active" ? { status: "ACTIVE" } : filter === "archived" ? { status: "ARCHIVED" } : {}) },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      include: { ...include, mediaAssets: { where: { type: "IMAGE", isPrimaryReference: true, deletedAt: null }, select: { id: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 1 } },
      take: 200,
    })),
    get: (id: string) => scoped((tx, where) => find(tx, where, id)),
    create: (input: unknown, requestId: string = randomUUID(), referencePhotos: ReferencePhoto[] = []) => scoped(async (tx, where, workspaceId) => {
      const data = characterSchema.parse(input);
      const id = z.uuid().parse(requestId);
      // The same submission UUID survives retries, including a lost success response.
      // Reuse the existing primary key; never return a foreign or deleted record.
      const existing = await tx.character.findFirst({ where: { ...where, id }, include });
      if (existing) return existing;
      return tx.character.create({ data: {
        ...data.identity, voice: data.voice, id, workspaceId, slug: slug(data.identity.name), status: "ACTIVE",
        appearance: { create: data.appearance }, personality: { create: data.personality },
        mediaAssets: { create: referencePhotos },
      }, include });
    }, true).catch(async (error: unknown) => {
      // PostgreSQL can report a primary-key conflict instead of a serialization
      // conflict when two identical submissions arrive together.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return scoped((tx, where) => find(tx, where, requestId));
      }
      throw error;
    }),
    updateAppearanceWithPhotos: (id: string, input: unknown, photos: ReferencePhoto[]) => scoped(async (tx, where, workspaceId) => {
      const character = await find(tx, where, id);
      if (character.status === "ARCHIVED") throw new CharacterUnavailable();
      const data = sectionSchemas.appearance.parse(input);
      const batchId = z.uuid().parse(photos[0]?.id);
      const previous = await tx.mediaAsset.findUnique({ where: { id: batchId } });
      if (previous) {
        if (previous.characterId !== id || previous.workspaceId !== workspaceId || previous.provider !== referencePhotoProvider) throw new CharacterUnavailable();
        return character;
      }
      const count = await tx.mediaAsset.count({ where: { characterId: id, workspaceId, provider: referencePhotoProvider, deletedAt: null } });
      if (!photos.length || count + photos.length > maxCharacterPhotos) throw new CharacterPhotoLimit();
      await tx.mediaAsset.updateMany({ where: { characterId: id, workspaceId, isPrimaryReference: true }, data: { isPrimaryReference: false } });
      await tx.mediaAsset.createMany({ data: photos.map((photo) => ({ ...photo, workspaceId, characterId: id })) });
      return tx.character.update({ where: { id }, data: { appearance: { upsert: { create: data, update: data } }, updatedAt: new Date() }, include });
    }, true),
    update: (id: string, section: CharacterSection, input: unknown) => scoped(async (tx, where) => {
      const character = await find(tx, where, id);
      z.enum(["identity", "appearance", "personality", "voice"]).parse(section);
      if (section === "voice") return tx.character.update({ where: { ...where, id: character.id }, data: { voice: sectionSchemas.voice.parse(input) }, include });
      if (section === "identity") {
        return tx.character.update({ where: { ...where, id: character.id }, data: sectionSchemas.identity.parse(input), include });
      }
      // Nested upsert also supports existing Foundation records with missing layers.
      const data = sectionSchemas[section].parse(input);
      return tx.character.update({ where: { ...where, id: character.id }, data: {
        [section]: { upsert: { create: data, update: data } }, updatedAt: new Date(),
      }, include });
    }, true),
    duplicate: (id: string) => scoped(async (tx, where, workspaceId) => {
      const source = await find(tx, where, id);
      const base = `${source.name.slice(0, 100)} — копия`;
      let name = base;
      for (let index = 2; await tx.character.findFirst({ where: { workspaceId, name }, select: { id: true } }); index++) {
        name = index <= 200 ? `${base} ${index}` : `${base} ${randomUUID().slice(0, 8)}`;
      }
      const appearance = source.appearance;
      const personality = source.personality;
      return tx.character.create({ data: {
        workspaceId, name, slug: slug(name), kind: source.kind, gender: source.gender, ageRange: source.ageRange,
        niche: source.niche, biography: source.biography, voice: source.voice === null ? Prisma.JsonNull : source.voice, status: "ACTIVE",
        appearance: { create: appearance ? {
          hairColor: appearance.hairColor, hairStyle: appearance.hairStyle, clothingStyle: appearance.clothingStyle,
          visualDescription: appearance.visualDescription, additionalInstructions: appearance.additionalInstructions,
          attributes: appearance.attributes === null ? Prisma.JsonNull : appearance.attributes,
        } : {} },
        personality: { create: personality ? {
          communicationStyle: personality.communicationStyle, tone: personality.tone, traits: personality.traits,
          description: personality.description, additionalInstructions: personality.additionalInstructions,
          attributes: personality.attributes === null ? Prisma.JsonNull : personality.attributes,
        } : {} },
      }, include });
    }, true),
    manage: (id: string, operation: "archive" | "restore" | "delete") => scoped(async (tx, where) => {
      const character = await find(tx, where, id);
      const action = z.enum(["archive", "restore", "delete"]).parse(operation);
      return tx.character.update({ where: { ...where, id: character.id }, data: action === "delete"
        ? { deletedAt: new Date() } : { status: action === "archive" ? "ARCHIVED" : "ACTIVE" } });
    }, true),
  };
}


