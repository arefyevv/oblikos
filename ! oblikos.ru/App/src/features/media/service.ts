import "server-only";
import { currentWorkspace } from "@/features/auth/access";
import { OpenAICompatibleImageProvider } from "@/features/ai/image-provider";
import { createMediaService } from "./operations";
import { LocalStorageProvider } from "./storage";

export const media = createMediaService(async () => {
  const member = await currentWorkspace();
  return { userId: member.userId, workspaceId: member.workspaceId };
}, new OpenAICompatibleImageProvider(), new LocalStorageProvider());
