import "server-only";
import { z } from "zod";
import { createCharacterService } from "@/features/characters/operations";
import { createMemoryService } from "@/features/memory/operations";
import { bodySchema, type GenerationInput } from "@/features/content/validation";
import { buildCharacterContext, memoryLimit } from "./context";
import { buildPrompt } from "./prompt";
import { AIError, type AIProvider } from "./types";

export async function generateCharacterText(context: { userId: string; workspaceId: string }, request: GenerationInput, provider: AIProvider) {
  const resolver = async () => context;
  const character = await createCharacterService(resolver).get(request.characterId);
  if (character.status === "ARCHIVED") throw new AIError("response");
  const entries = await createMemoryService(resolver).retrieve(character.id, { limit: memoryLimit });
  const result = await provider.generate(buildPrompt(buildCharacterContext(character, entries), request));
  const parsed = bodySchema.safeParse({ body: result.body });
  if (!parsed.success || !z.string().min(1).max(80).safeParse(result.provider).success || !z.string().min(1).max(160).safeParse(result.model).success) throw new AIError("response");
  return { ...result, body: parsed.data.body };
}
