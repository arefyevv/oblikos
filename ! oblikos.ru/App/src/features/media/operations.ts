import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { Prisma } from "@/generated/prisma/client";
import { buildVisualContext, buildCharacterImagePrompt } from "@/features/ai/visual-context";
import { ImageError, type ImageProvider } from "@/features/ai/image-types";
import { inspectImage } from "./image-file";
import { imageRequestSchema, type MediaView } from "./validation";
import type { StorageProvider } from "./storage";
import { reserveGeneration, GenerationSafetyError } from "@/features/ai/safety";
import { operationLog } from "@/lib/server/logging";
import { maxCharacterPhotos, referencePhotoProvider } from "@/features/characters/photo-limits";

export class MediaUnavailable extends Error { constructor() { super("Изображение или персонаж недоступен."); } }
export class MediaBusy extends Error { constructor(message = "Запрос уже выполняется. Дождитесь результата и обновите медиатеку.") { super(message); } }
export class MediaFailed extends Error { constructor() { super("Этот запрос завершился ошибкой. Для новой попытки отправьте новый запрос."); } }
export class MediaArchived extends Error { constructor() { super("Восстановите персонажа из архива перед генерацией."); } }
type Context = { userId: string; workspaceId: string };
const include = { character: { select: { id: true, name: true, status: true } } } as const;
export type MediaRecord = Prisma.MediaAssetGetPayload<{ include: typeof include }>;
export function mediaView(asset: MediaRecord): MediaView {
  return { id: asset.id, type: asset.type, duration: asset.duration, referenceAssetId: asset.referenceAssetId, characterId: asset.characterId, characterName: asset.character.name, createdAt: asset.createdAt.toISOString(), isPrimaryReference: asset.isPrimaryReference, prompt: asset.prompt };
}
function validId(id: string) { if (!z.uuid().safeParse(id).success) throw new MediaUnavailable(); }
function writeConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  if (!(error instanceof Error) || !("cause" in error)) return false;
  const cause = error.cause;
  return typeof cause === "object" && cause !== null && "originalCode" in cause && ["40001", "40P01"].includes(String(cause.originalCode));
}

export function createMediaService(resolveContext: () => Promise<Context>, provider: ImageProvider, storage: StorageProvider) {
  async function scoped<T>(context: Context, work: (tx: Prisma.TransactionClient, where: Prisma.MediaAssetWhereInput) => Promise<T>, write = false): Promise<T> {
    validId(context.userId); validId(context.workspaceId);
    for (let attempt = 0; ; attempt++) {
      try {
        return await getDatabase().$transaction(async (tx) => {
          if (!await tx.workspaceMember.findUnique({ where: { workspaceId_userId: context } })) throw new MediaUnavailable();
          return work(tx, { workspaceId: context.workspaceId, deletedAt: null, character: { workspaceId: context.workspaceId, deletedAt: null } });
        }, { isolationLevel: write ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.ReadCommitted });
      } catch (error) {
        if (writeConflict(error) && attempt < 4) { await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt)); continue; }
        throw error;
      }
    }
  }
  async function character(tx: Prisma.TransactionClient, context: Context, id: string, write = false) {
    validId(id);
    const entry = await tx.character.findFirst({ where: { id, workspaceId: context.workspaceId, deletedAt: null }, include: { appearance: true, personality: true } });
    if (!entry) throw new MediaUnavailable();
    if (write && entry.status === "ARCHIVED") throw new MediaArchived();
    return entry;
  }
  async function find(tx: Prisma.TransactionClient, where: Prisma.MediaAssetWhereInput, id: string) {
    validId(id);
    const entry = await tx.mediaAsset.findFirst({ where: { ...where, id }, include });
    if (!entry) throw new MediaUnavailable();
    return entry;
  }
  return {
    list: async (characterId?: string, page = 1, type?: "IMAGE" | "VIDEO") => {
      const context = await resolveContext();
      z.number().int().min(1).max(10000).parse(page);
      return scoped(context, async (tx, where) => {
        if (characterId) await character(tx, context, characterId);
        if (type) z.enum(["IMAGE", "VIDEO"]).parse(type);
        const filter = { ...where, ...(characterId ? { characterId } : {}), ...(type ? { type } : {}) };
        return { entries: await tx.mediaAsset.findMany({ where: filter, include, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 48, skip: (page - 1) * 48 }), total: await tx.mediaAsset.count({ where: filter }) };
      });
    },
    get: async (id: string) => scoped(await resolveContext(), (tx, where) => find(tx, where, id)),
    primary: async (characterId: string) => {
      const context = await resolveContext();
      return scoped(context, async (tx, where) => {
        await character(tx, context, characterId);
        return tx.mediaAsset.findFirst({ where: { ...where, type: "IMAGE", characterId, isPrimaryReference: true }, include });
      });
    },
    read: async (id: string) => {
      const context = await resolveContext();
      const asset = await scoped(context, (tx, where) => find(tx, where, id));
      const bytes = await storage.read(asset.storageKey);
      // Recheck after I/O: revoked membership/deleted character can't obtain bytes.
      await scoped(context, (tx, where) => find(tx, where, id));
      return { bytes, mimeType: asset.mimeType };
    },
    open: async (id: string) => {
      const context = await resolveContext();
      const asset = await scoped(context, (tx, where) => find(tx, where, id));
      if (!storage.open) throw new ImageError("storage");
      const file = await storage.open(asset.storageKey);
      try {
        await scoped(context, (tx, where) => find(tx, where, id));
        if (file.size !== asset.fileSize) throw new ImageError("storage");
        return { ...file, mimeType: asset.mimeType };
      } catch (error) { await file.close(); throw error; }
    },
    generate: async (input: unknown, requestId: string) => {
      const context = await resolveContext(); validId(requestId);
      const request = imageRequestSchema.parse(input);
      const fingerprint = createHash("sha256").update(JSON.stringify(request)).digest("hex");
      let visual!: Awaited<ReturnType<typeof character>>;
      let reference: MediaRecord | null = null;
      let referencePhotos: MediaRecord[] = [];
      try {
        await scoped(context, async (tx, where) => {
          visual = await character(tx, context, request.characterId, true);
          reference = await tx.mediaAsset.findFirst({ where: { ...where, characterId: request.characterId, isPrimaryReference: true }, include });
          referencePhotos = await tx.mediaAsset.findMany({ where: { ...where, type: "IMAGE", characterId: request.characterId, provider: referencePhotoProvider }, include, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: maxCharacterPhotos });
          await tx.mediaGeneration.create({ data: { id: requestId, workspaceId: context.workspaceId, characterId: request.characterId, fingerprint } });
        }, true);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
        return scoped(context, async (tx, where) => {
          await character(tx, context, request.characterId, true);
          const receipt = await tx.mediaGeneration.findFirst({ where: { id: requestId, type: "IMAGE", workspaceId: context.workspaceId, characterId: request.characterId, fingerprint } });
          if (!receipt) throw new MediaUnavailable();
          if (receipt.status === "FAILED") throw new MediaFailed();
          if (!receipt.mediaId) throw new MediaBusy();
          return find(tx, where, receipt.mediaId);
        });
      }
      let key: string | undefined;
      const started = Date.now();
      try {
        const capabilities = provider.capabilities();
        // Snapshot of the explicitly chosen reference at submission time.
        const primary = reference as MediaRecord | null;
        const selected = primary ? [primary, ...referencePhotos.filter((photo) => photo.id !== primary.id)].slice(0, maxCharacterPhotos) : [];
        const references = selected.length && capabilities.referenceImages ? await Promise.all(selected.map(async (photo) => ({ bytes: await storage.read(photo.storageKey), mimeType: photo.mimeType }))) : undefined;
        await scoped(context, async (tx, where) => {
          await character(tx, context, request.characterId, true);
          if (primary) await find(tx, where, primary.id);
          for (const photo of selected) await find(tx, where, photo.id);
        });
        const prompt = buildCharacterImagePrompt(buildVisualContext(visual), request, Boolean(references));
        await reserveGeneration("image", context);
        const result = await provider.generateImage({ prompt, aspectRatio: request.aspectRatio, referenceImages: references });
        z.string().trim().min(1).max(80).parse(result.provider); z.string().trim().min(1).max(160).parse(result.model);
        if (result.referenceUsed && !references) throw new ImageError("response");
        const metadata = await inspectImage(result.bytes);
        key = await storage.save({ workspaceId: context.workspaceId, characterId: request.characterId, extension: metadata.extension, bytes: result.bytes });
        const storageKey = key;
        const saved = await scoped(context, async (tx, where) => {
          await character(tx, context, request.characterId, true);
          if (primary) await find(tx, where, primary.id);
          for (const photo of selected) await find(tx, where, photo.id);
          const asset = await tx.mediaAsset.create({ data: { workspaceId: context.workspaceId, characterId: request.characterId, mimeType: metadata.mimeType, width: metadata.width, height: metadata.height, fileSize: metadata.fileSize, storageKey, prompt, provider: result.provider, model: result.model, referenceAssetId: primary?.id, referenceUsed: result.referenceUsed }, include });
          await tx.mediaGeneration.update({ where: { id: requestId }, data: { status: "READY", mediaId: asset.id } });
          return asset;
        }, true);
        operationLog("completed", "image", { requestId, durationMs: Date.now() - started });
        return saved;
      } catch (error) {
        // A DB commit with a lost acknowledgement is ambiguous: never erase a
        // possibly committed file. Clean up only after confirming no asset exists.
        if (key) {
          const saved = await getDatabase().mediaAsset.findUnique({ where: { storageKey: key } }).catch(() => undefined);
          if (saved === null) await storage.delete(key).catch(() => console.error("Media orphan cleanup failed"));
        }
        await getDatabase().mediaGeneration.updateMany({ where: { id: requestId, workspaceId: context.workspaceId, status: "PENDING" }, data: { status: "FAILED" } }).catch(() => undefined);
        operationLog("failed", "image", { requestId, durationMs: Date.now() - started, code: error instanceof ImageError || error instanceof GenerationSafetyError ? error.code : "operation" });
        throw error;
      }
    },
    setPrimary: async (id: string, characterId: string) => {
      const context = await resolveContext();
      return scoped(context, async (tx, where) => {
        const asset = await find(tx, where, id);
        if (asset.type !== "IMAGE") throw new MediaUnavailable();
        validId(characterId);
        if (asset.characterId !== characterId) throw new MediaUnavailable();
        await tx.mediaAsset.updateMany({ where: { ...where, characterId, isPrimaryReference: true }, data: { isPrimaryReference: false } });
        return tx.mediaAsset.update({ where: { id: asset.id }, data: { isPrimaryReference: true }, include });
      }, true);
    },
    delete: async (id: string) => {
      const context = await resolveContext(); validId(id);
      const asset = await scoped(context, async (tx, where) => {
        // Allow a deletion retry to clean up the file after a previous I/O failure.
        const current = await tx.mediaAsset.findFirst({ where: { ...where, deletedAt: undefined, id }, include });
        if (!current) throw new MediaUnavailable();
        if (current.deletedAt) return current;
        if (await tx.mediaGeneration.findFirst({ where: { workspaceId: context.workspaceId, characterId: current.characterId, type: "VIDEO", referenceAssetId: id, status: { in: ["PENDING", "PROCESSING"] } } })) throw new MediaBusy("Этот образ используется в создаваемом видео. Дождитесь завершения генерации перед удалением.");
        return tx.mediaAsset.update({ where: { id }, data: { isPrimaryReference: false, deletedAt: new Date() }, include });
      }, true);
      await storage.delete(asset.storageKey);
      return asset;
    },
  };
}
