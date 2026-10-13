import "server-only";
import { currentWorkspace } from "@/features/auth/access";
import { OpenAIProvider } from "@/features/ai/provider";
import { createContentService } from "./operations";

export const content = createContentService(async () => {
  const member = await currentWorkspace();
  return { userId: member.userId, workspaceId: member.workspaceId };
}, new OpenAIProvider());
