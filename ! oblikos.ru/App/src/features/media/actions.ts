"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ImageError, imageMessages } from "@/features/ai/image-types";
import { media } from "./service";
import { MediaUnavailable, MediaBusy, MediaFailed, MediaArchived } from "./operations";
import type { MediaResult } from "./validation";
import { GenerationSafetyError, generationSafetyMessages } from "@/features/ai/safety";

function failure(error: unknown): MediaResult {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) return { ok: false, message: "Проверьте данные изображения.", terminal: true };
  if (error instanceof ImageError) return { ok: false, message: imageMessages[error.code], terminal: true };
  if (error instanceof GenerationSafetyError) return { ok: false, message: generationSafetyMessages[error.code], terminal: true };
  if (error instanceof MediaBusy) return { ok: false, message: error.message };
  if (error instanceof MediaUnavailable || error instanceof MediaFailed || error instanceof MediaArchived) return { ok: false, message: error.message, terminal: true };
  console.error("Media operation failed", error instanceof Error ? error.name : "UnknownError");
  return { ok: false, message: "Не удалось выполнить действие. Обновите медиатеку перед повторной попыткой." };
}
function saved(asset: { id: string; characterId: string }, message: string): MediaResult {
  revalidatePath("/animation");
  revalidatePath("/dashboard");
  revalidatePath("/media");
  revalidatePath("/characters");
  revalidatePath(`/characters/${asset.characterId}`, "layout");
  return { ok: true, message, id: asset.id };
}
export async function generateImageAction(input: unknown, requestId: string): Promise<MediaResult> {
  try { return saved(await media.generate(input, requestId), "Изображение создано и сохранено. Вы можете использовать его как основной образ."); } catch (error) { return failure(error); }
}
export async function setPrimaryImageAction(id: string, characterId: string): Promise<MediaResult> {
  try { return saved(await media.setPrimary(id, characterId), "Основной образ обновлён."); } catch (error) { return failure(error); }
}
export async function deleteImageAction(id: string): Promise<MediaResult> {
  try { const asset = await media.delete(id); return saved(asset, asset.type === "VIDEO" ? "Видео удалено." : "Изображение удалено."); } catch (error) { return failure(error); }
}
