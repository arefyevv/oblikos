"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { currentWorkspace } from "@/features/auth/access";
import { rateLimit, RateLimitError } from "@/features/auth/rate-limit";
import { reserveGeneration, GenerationSafetyError, generationSafetyMessages } from "@/features/ai/safety";
import { OpenAIProvider } from "@/features/ai/provider";
import { AIError, aiMessages } from "@/features/ai/types";
import { LocalStorageProvider } from "@/features/media/storage";
import { PhotoInputError, prepareCharacterPhotos, createPhotoCharacterService, createAppearancePhotoService } from "./photo-operations";
import { CharacterUnavailable, CharacterPhotoLimit } from "./operations";
import { validationErrors, type CharacterInput, type CharacterResult } from "./validation";
import { z } from "zod";

async function context() {
  const member = await currentWorkspace();
  return { userId: member.userId, workspaceId: member.workspaceId };
}
function failure(error: unknown): CharacterResult {
  unstable_rethrow(error);
  if (error instanceof PhotoInputError) return { ok: false, message: error.message };
  if (error instanceof CharacterPhotoLimit) return { ok: false, message: error.message };
  if (error instanceof CharacterUnavailable) return { ok: false, message: "Персонаж недоступен для изменения." };
  if (error instanceof RateLimitError) return { ok: false, message: "Слишком много загрузок. Повторите позже." };
  if (error instanceof z.ZodError) return { ok: false, message: "Проверьте введённые данные.", errors: validationErrors(error) };
  if (error instanceof AIError) return { ok: false, message: error.code === "response" ? "Не удалось описать внешность. Выберите чёткие фото одного человека или заполните описание вручную." : aiMessages[error.code] };
  if (error instanceof GenerationSafetyError) return { ok: false, message: generationSafetyMessages[error.code] };
  console.error("Character photos failed", error instanceof Error ? error.name : "UnknownError");
  return { ok: false, message: "Не удалось обработать фото. Повторите попытку." };
}
export async function describeCharacterPhotosAction(form: FormData): Promise<CharacterResult & { appearance?: CharacterInput["appearance"] }> {
  try {
    const member = await context();
    await rateLimit("photo-analysis", member.userId, 10);
    const photos = await prepareCharacterPhotos(form.getAll("photos"));
    await reserveGeneration("text", member);
    const appearance = await new OpenAIProvider().describeAppearance(photos);
    return { ok: true, message: "Внешность заполнена по фото. Проверьте и при необходимости уточните описание.", appearance };
  } catch (error) { return failure(error); }
}
export async function createCharacterFromPhotosAction(input: unknown, requestId: string, form: FormData): Promise<CharacterResult> {
  try {
    const member = await context();
    await rateLimit("photo-upload", member.userId, 20);
    const character = await createPhotoCharacterService(async () => member, new LocalStorageProvider())(input, requestId, form.getAll("photos"));
    revalidatePath("/dashboard"); revalidatePath("/characters"); revalidatePath("/media"); revalidatePath(`/characters/${character.id}`, "layout");
    return { ok: true, id: character.id, message: "Персонаж создан по фото. Референсы сохранены в медиатеке." };
  } catch (error) { return failure(error); }
}
export async function updateAppearanceWithPhotosAction(id: string, input: unknown, requestId: string, form: FormData): Promise<CharacterResult> {
  try {
    const member = await context();
    await rateLimit("photo-upload", member.userId, 20);
    await createAppearancePhotoService(async () => member, new LocalStorageProvider())(id, input, requestId, form.getAll("photos"));
    revalidatePath("/dashboard"); revalidatePath("/characters"); revalidatePath("/media"); revalidatePath(`/characters/${id}`, "layout");
    return { ok: true, message: "Внешность и фото сохранены. Основной образ обновлён." };
  } catch (error) { return failure(error); }
}
