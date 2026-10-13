import "server-only";
import { currentWorkspace } from "@/features/auth/access";
import { createVoiceService } from "./operations";
export const voice = createVoiceService(async () => {
  const member = await currentWorkspace();
  return { userId: member.userId, workspaceId: member.workspaceId };
});
