import "server-only";
import type { CharacterRecord } from "@/features/characters/operations";
import type { MemoryEntry } from "@/generated/prisma/client";
import type { CharacterContext } from "./types";

export const memoryLimit = 25;
export const memoryCharacterBudget = 16000;
function compact(values: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).flatMap(([key, value]) => value?.trim() ? [[key, value.trim()]] : []));
}

// Retrieval stays in the existing Memory service; this boundary strips metadata,
// checks character IDs defensively and bounds total context size as well as count.
export function buildCharacterContext(character: CharacterRecord, entries: MemoryEntry[]): CharacterContext {
  let budget = memoryCharacterBudget;
  const memory = entries.filter((entry) => entry.characterId === character.id).sort((a, b) =>
    Number(b.isPinned) - Number(a.isPinned) || b.importance - a.importance || b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id),
  ).slice(0, memoryLimit).flatMap((entry) => {
    const text = entry.content.trim();
    if (!text || text.length > budget) return [];
    budget -= text.length;
    return [{ type: entry.type, content: text, isPinned: entry.isPinned, importance: entry.importance }];
  });
  const p = character.personality;
  const personality: CharacterContext["personality"] = compact({ communicationStyle: p?.communicationStyle, tone: p?.tone, description: p?.description, additionalInstructions: p?.additionalInstructions });
  if (p?.traits.length) personality.traits = p.traits.filter((trait) => trait.trim());
  return {
    identity: compact({ name: character.name, kind: character.kind || "HUMAN", gender: character.kind === "HUMAN" ? character.gender : undefined, ageRange: character.kind === "HUMAN" ? character.ageRange : undefined, niche: character.niche, biography: character.biography }),
    personality, memory,
  };
}
