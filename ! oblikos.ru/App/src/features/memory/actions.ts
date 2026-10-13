"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { validationErrors } from "@/features/characters/validation";
import { memory } from "./service";
import { MemoryUnavailable } from "./operations";
import type { MemoryResult } from "./validation";

function failure(error: unknown): MemoryResult {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) return { ok: false, message: "Проверьте введённые данные.", errors: validationErrors(error) };
  if (error instanceof MemoryUnavailable) return { ok: false, message: "Память недоступна. Обновите страницу или вернитесь к персонажам." };
  console.error("Memory operation failed", error instanceof Error ? error.name : "UnknownError");
  return { ok: false, message: "Не удалось сохранить изменения. Повторите попытку позже." };
}
function saved(characterId: string, message: string): MemoryResult {
  revalidatePath("/dashboard");
  revalidatePath(`/characters/${characterId}/memory`);
  return { ok: true, message };
}
export async function createMemoryAction(characterId: string, input: unknown, requestId: string): Promise<MemoryResult> {
  try { await memory.create(characterId, input, requestId); return saved(characterId, "Воспоминание добавлено."); }
  catch (error) { return failure(error); }
}
export async function updateMemoryAction(characterId: string, id: string, input: unknown): Promise<MemoryResult> {
  try { await memory.update(characterId, id, input); return saved(characterId, "Воспоминание сохранено."); }
  catch (error) { return failure(error); }
}
export async function pinMemoryAction(characterId: string, id: string, pinned: boolean): Promise<MemoryResult> {
  try { await memory.pin(characterId, id, pinned); return saved(characterId, pinned ? "Воспоминание закреплено." : "Воспоминание откреплено."); }
  catch (error) { return failure(error); }
}
export async function deleteMemoryAction(characterId: string, id: string): Promise<MemoryResult> {
  try { await memory.delete(characterId, id); return saved(characterId, "Воспоминание удалено."); }
  catch (error) { return failure(error); }
}
