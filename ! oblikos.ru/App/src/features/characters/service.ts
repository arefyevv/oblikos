import "server-only";
import { currentWorkspace } from "@/features/auth/access";
import { createCharacterService } from "./operations";
export { CharacterUnavailable } from "./operations";
export type { CharacterRecord, CharacterFilter } from "./operations";

export const characters = createCharacterService(async () => {
  const member = await currentWorkspace();
  return { userId: member.userId, workspaceId: member.workspaceId };
});
