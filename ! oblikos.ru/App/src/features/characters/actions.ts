"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { characters, CharacterUnavailable } from "./service";
import { validationErrors, type CharacterResult, type CharacterSection } from "./validation";

function failure(error: unknown): CharacterResult {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) return { ok: false, message: "Проверьте введённые данные.", errors: validationErrors(error) };
  if (error instanceof CharacterUnavailable) return { ok: false, message: "Персонаж недоступен. Вернитесь к списку персонажей." };
  console.error("Character operation failed", error instanceof Error ? error.name : "UnknownError");
  return { ok: false, message: "Не удалось сохранить изменения. Повторите попытку позже." };
}
function invalidate(id: string) {
  revalidatePath("/dashboard");
  revalidatePath("/characters");
  revalidatePath(`/characters/${id}`, "layout");
}
export async function createCharacterAction(input: unknown, requestId: string): Promise<CharacterResult> {
  try {
    const character = await characters.create(input, z.uuid().parse(requestId));
    invalidate(character.id);
    return { ok: true, id: character.id, message: "Персонаж создан." };
  } catch (error) { return failure(error); }
}
export async function updateCharacterAction(id: string, section: CharacterSection, input: unknown): Promise<CharacterResult> {
  try {
    const character = await characters.update(id, section, input);
    invalidate(character.id);
    return { ok: true, message: "Изменения сохранены." };
  } catch (error) { return failure(error); }
}
export async function manageCharacterAction(id: string, operation: "duplicate" | "archive" | "restore" | "delete"): Promise<CharacterResult> {
  try {
    const parsed = z.enum(["duplicate", "archive", "restore", "delete"]).parse(operation);
    const character = parsed === "duplicate" ? await characters.duplicate(id) : await characters.manage(id, parsed);
    invalidate(id);
    return { ok: true, id: parsed === "duplicate" ? character.id : undefined, message: parsed === "archive" ? "Персонаж архивирован." : parsed === "restore" ? "Персонаж восстановлен." : parsed === "delete" ? "Персонаж удалён." : "Копия создана." };
  } catch (error) { return failure(error); }
}
