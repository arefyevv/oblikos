import "server-only";
import { currentWorkspace } from "@/features/auth/access";
import { createDashboardService } from "./operations";

export const dashboard = createDashboardService(async () => {
  const member = await currentWorkspace();
  return { userId: member.userId, workspaceId: member.workspaceId };
});
