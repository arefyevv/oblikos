"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AIError, aiMessages } from "@/features/ai/types";
import { validationErrors } from "@/features/characters/validation";
import { content } from "./service";
import { ContentUnavailable, ContentBusy, ContentFailed, ContentConflict, ArchivedCharacter, type ContentRecord } from "./operations";
import { GenerationSafetyError, generationSafetyMessages } from "@/features/ai/safety";
import type { ContentResult } from "./validation";

function failure(error: unknown): ContentResult {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) return { ok: false, message: "Проверьте введённые данные.", errors: validationErrors(error) };
  if (error instanceof AIError) return { ok: false, message: aiMessages[error.code], terminal: true };
  if (error instanceof GenerationSafetyError) return { ok: false, message: generationSafetyMessages[error.code], terminal: true };
  if (error instanceof ContentFailed || error instanceof ContentConflict || error instanceof ArchivedCharacter) return { ok: false, message: error.message, terminal: true };
  if (error instanceof ContentBusy) return { ok: false, message: error.message };
  if (error instanceof ContentUnavailable) return { ok: false, message: "Контент или персонаж недоступен. Обновите страницу." };
  console.error("Content operation failed", error instanceof Error ? error.name : "UnknownError");
  return { ok: false, message: "Не удалось выполнить действие. Повторите попытку позже." };
}
function saved(entry: Pick<ContentRecord, "id" | "characterId">, message: string): ContentResult {
  revalidatePath("/dashboard");
  revalidatePath("/content");
  revalidatePath(`/content/${entry.id}`);
  revalidatePath(`/characters/${entry.characterId}/content`);
  return { ok: true, message, id: entry.id };
}
export async function generateContentAction(input: unknown, requestId: string): Promise<ContentResult> {
  try { return saved(await content.generate(input, requestId), "Текст создан и сохранён."); } catch (error) { return failure(error); }
}
export async function regenerateContentAction(id: string, requestId: string): Promise<ContentResult> {
  try { return saved(await content.regenerate(id, requestId), "Новый текст сохранён."); } catch (error) { return failure(error); }
}
export async function updateContentAction(id: string, input: unknown, expectedUpdatedAt: string): Promise<ContentResult> {
  try { return saved(await content.update(id, input, expectedUpdatedAt), "Изменения сохранены."); } catch (error) { return failure(error); }
}
export async function deleteContentAction(id: string): Promise<ContentResult> {
  try { return saved(await content.delete(id), "Контент удалён."); } catch (error) { return failure(error); }
}
