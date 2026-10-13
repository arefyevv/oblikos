import "server-only";
import { currentWorkspace } from "@/features/auth/access";
import { LocalStorageProvider } from "./storage";
import { createSourceService } from "./source-operations";
export const videoSources = createSourceService(async () => { const member = await currentWorkspace(); return { userId: member.userId, workspaceId: member.workspaceId }; }, new LocalStorageProvider());
