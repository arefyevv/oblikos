import "server-only";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { MediaUnavailable, MediaArchived } from "./operations";
import { VideoError } from "@/features/ai/video-types";
import { inspectSource } from "./source-file";
import { inspectImage } from "./image-file";
import type { StorageProvider } from "./storage";

export type VideoContext = { userId: string; workspaceId: string };
export async function assertVideoAccess(context: VideoContext, characterId: string, write = false) {
  z.uuid().parse(characterId); z.uuid().parse(context.userId); z.uuid().parse(context.workspaceId);
  const db = getDatabase();
  if (!await db.workspaceMember.findUnique({ where: { workspaceId_userId: context } })) throw new MediaUnavailable();
  const character = await db.character.findFirst({ where: { id: characterId, workspaceId: context.workspaceId, deletedAt: null }, include: { appearance: true, personality: true } });
  if (!character) throw new MediaUnavailable();
  if (write && character.status === "ARCHIVED") throw new MediaArchived();
  return character;
}
export function createSourceService(resolveContext: () => Promise<VideoContext>, storage: StorageProvider) {
  async function get(id: string, characterId: string) {
    z.uuid().parse(id);
    const context = await resolveContext(); await assertVideoAccess(context, characterId);
    const source = await getDatabase().videoSource.findFirst({ where: { id, characterId, ...context, expiresAt: { gt: new Date() } } });
    if (!source) throw new VideoError("source");
    return source;
  }
  return {
    get,
    read: async (id: string, characterId: string) => {
      const source = await get(id, characterId), bytes = await storage.read(source.storageKey);
      await get(id, characterId);
      return { source, bytes };
    },
    upload: async (characterId: string, kind: "AUDIO" | "VIDEO" | "IMAGE", bytes: Buffer) => {
      const context = await resolveContext(); await assertVideoAccess(context, characterId, true);
      // Uploads have no paid calls. A separate atomic quota caps disk usage.
      const { reserveGeneration } = await import("@/features/ai/safety");
      await reserveGeneration("upload", context);
      const metadata = kind === "IMAGE" ? await inspectImage(bytes) : await inspectSource(bytes, kind);
      const key = await storage.save({ ...context, characterId, extension: metadata.extension, bytes });
      try {
        await assertVideoAccess(context, characterId, true);
        if (kind === "IMAGE") {
          const image = metadata as Awaited<ReturnType<typeof inspectImage>>;
          return await getDatabase().mediaAsset.create({ data: { workspaceId: context.workspaceId, characterId, type: "IMAGE", storageKey: key, mimeType: image.mimeType, width: image.width, height: image.height, fileSize: image.fileSize, provider: "upload", model: "scene-image", prompt: "Загруженное изображение для видео" } });
        }
        const source = metadata as Awaited<ReturnType<typeof inspectSource>>;
        return await getDatabase().videoSource.create({ data: { ...context, characterId, kind, storageKey: key, mimeType: source.mimeType, duration: source.duration, fileSize: source.fileSize, hasAudio: source.hasAudio, expiresAt: new Date(Date.now() + 86400000) } });
      } finally {
        const db = getDatabase();
        const records = await Promise.all([db.videoSource.findUnique({ where: { storageKey: key } }), db.mediaAsset.findUnique({ where: { storageKey: key } })]).catch(() => undefined);
        if (records && records.every(record => !record)) await storage.delete(key);
      }
    },
  };
}
