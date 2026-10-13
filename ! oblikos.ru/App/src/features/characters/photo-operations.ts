import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { inspectImage } from "@/features/media/image-file";
import type { StorageProvider } from "@/features/media/storage";
import { createCharacterService } from "./operations";
import { characterSchema, appearanceSchema } from "./validation";
import { maxCharacterPhotos, maxPreparedPhotoBytes, referencePhotoProvider } from "./photo-limits";

export class PhotoInputError extends Error {}
export async function prepareCharacterPhotos(files: FormDataEntryValue[]) {
  if (!files.length || files.length > maxCharacterPhotos) throw new PhotoInputError("Загрузите от 1 до 10 фотографий.");
  const photos: { bytes: Buffer; mimeType: string; extension: string; width: number; height: number; fileSize: number }[] = [];
  for (const file of files) {
    if (!(file instanceof File) || !file.size || file.size > maxPreparedPhotoBytes) throw new PhotoInputError("Не удалось принять фото. Выберите JPG, PNG или WebP до 10 МБ через форму загрузки.");
    try {
      const original = Buffer.from(await file.arrayBuffer());
      await inspectImage(original);
      // Decode, apply orientation, strip metadata and bound dimensions on the server too.
      const bytes = await sharp(original, { limitInputPixels: 40_000_000 }).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      if (bytes.length > maxPreparedPhotoBytes) throw new Error("Image too large");
      const metadata = await inspectImage(bytes);
      photos.push({ bytes, ...metadata });
    } catch { throw new PhotoInputError("Одно из фото повреждено или имеет неподдерживаемый формат. Используйте JPG, PNG или WebP."); }
  }
  return photos;
}

export function createPhotoCharacterService(resolveContext: () => Promise<{ userId: string; workspaceId: string }>, storage: StorageProvider) {
  return async (input: unknown, requestId: string, files: FormDataEntryValue[]) => {
    const context = await resolveContext();
    const data = characterSchema.parse(input);
    const id = z.uuid().parse(requestId);
    const photos = await prepareCharacterPhotos(files);
    const keys: string[] = [];
    try {
      const references = [];
      for (const [index, photo] of photos.entries()) {
        const storageKey = await storage.save({ workspaceId: context.workspaceId, characterId: id, extension: photo.extension, bytes: photo.bytes });
        keys.push(storageKey);
        references.push({ storageKey, mimeType: photo.mimeType, width: photo.width, height: photo.height, fileSize: photo.fileSize, provider: referencePhotoProvider, model: "reference-photo", prompt: `Загруженный референс внешности · фото ${index + 1}`, isPrimaryReference: index === 0 });
      }
      // Profile and all reference records are committed together by the existing scoped service.
      return await createCharacterService(async () => context).create(data, id, references);
    } finally {
      // Lost DB acknowledgement must never delete a committed media file.
      const records = await getDatabase().mediaAsset.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } }).catch(() => undefined);
      if (records) {
        const committed = new Set(records.map((record) => record.storageKey));
        for (const key of keys) if (!committed.has(key)) await storage.delete(key).catch(() => console.error("Reference photo cleanup failed"));
      }
    }
  };
}

export function createAppearancePhotoService(resolveContext: () => Promise<{ userId: string; workspaceId: string }>, storage: StorageProvider) {
  return async (characterId: string, input: unknown, requestId: string, files: FormDataEntryValue[]) => {
    const context = await resolveContext();
    const data = appearanceSchema.parse(input);
    const batchId = z.uuid().parse(requestId);
    const characters = createCharacterService(async () => context);
    const character = await characters.get(characterId);
    if (character.status === "ARCHIVED") throw new PhotoInputError("Восстановите персонажа из архива перед загрузкой фото.");
    const photos = await prepareCharacterPhotos(files);
    const keys: string[] = [];
    try {
      const references = [];
      for (const [index, photo] of photos.entries()) {
        const storageKey = await storage.save({ workspaceId: context.workspaceId, characterId, extension: photo.extension, bytes: photo.bytes });
        keys.push(storageKey);
        references.push({ ...(index === 0 ? { id: batchId } : {}), storageKey, mimeType: photo.mimeType, width: photo.width, height: photo.height, fileSize: photo.fileSize, provider: referencePhotoProvider, model: "reference-photo", prompt: `Загруженный референс внешности · фото ${index + 1}`, isPrimaryReference: index === 0 });
      }
      return await characters.updateAppearanceWithPhotos(characterId, data, references);
    } finally {
      const records = await getDatabase().mediaAsset.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } }).catch(() => undefined);
      if (records) {
        const committed = new Set(records.map((record) => record.storageKey));
        for (const key of keys) if (!committed.has(key)) await storage.delete(key).catch(() => console.error("Reference photo cleanup failed"));
      }
    }
  };
}
