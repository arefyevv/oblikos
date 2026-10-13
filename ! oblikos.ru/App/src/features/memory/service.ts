import "server-only";
import { currentWorkspace } from "@/features/auth/access";
import { createMemoryService } from "./operations";

export const memory = createMemoryService(async () => {
  const member = await currentWorkspace();
  return { userId: member.userId, workspaceId: member.workspaceId };
});

// Authenticated, scoped structured retrieval for future server modules. No prompts.
export async function getCharacterMemory(characterId: string, limit = 30) {
  return memory.retrieve(characterId, { limit });
}
