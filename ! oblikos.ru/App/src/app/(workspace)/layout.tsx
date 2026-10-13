import { AppShell } from "@/components/layout/app-shell";
import { currentWorkspace, requireUser } from "@/features/auth/access";
import { VideoActivity } from "@/features/media/video-activity";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await currentWorkspace();
  const session = await requireUser();
  return (
    <AppShell user={{ name: session.user.name, email: session.user.email, image: session.user.image }}>
      {children}
      <VideoActivity key={`${workspace.workspaceId}:${workspace.userId}`} scope={`${workspace.workspaceId}:${workspace.userId}`}/>
    </AppShell>
  );
}
