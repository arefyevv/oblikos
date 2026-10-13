import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import type { WorkspaceRole } from "@/generated/prisma/client";
import { authOptions } from "./options";
import { authEnvironment } from "./config";
import { missingSessionStatus } from "./session-status";

export const currentSession = cache(async () =>
  getServerSession(authOptions()),
);
export const requireUser = cache(async () => {
  const session = await currentSession();
  if (!session?.user?.id) {
    const status = await missingSessionStatus(
      (await cookies()).getAll(),
      authEnvironment(),
      (id) => getDatabase().authSession.findUnique({ where: { id }, select: { userId: true, expiresAt: true } }),
    );
    redirect(status === "expired" ? "/login?error=SessionExpired" : "/login");
  }
  return session;
});

export async function requireWorkspaceMember(workspaceId: string) {
  const session = await requireUser();
  if (!z.uuid().safeParse(workspaceId).success) notFound();
  const member = await getDatabase().workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    include: { workspace: true },
  });
  if (!member) notFound(); // Don't disclose a foreign workspace's existence.
  return member;
}

export async function requireWorkspaceRole(
  workspaceId: string,
  roles: WorkspaceRole[],
) {
  const member = await requireWorkspaceMember(workspaceId);
  if (!roles.includes(member.role)) notFound();
  return member;
}

export const currentWorkspace = cache(async () => {
  const session = await requireUser();
  const requestedId = (await cookies()).get("oblikos.workspace")?.value;
  if (requestedId) return requireWorkspaceMember(requestedId);
  const member = await getDatabase().workspaceMember.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!member) notFound();
  return member;
});

export async function requireCharacterAccess(characterId: string) {
  const member = await currentWorkspace();
  if (!z.uuid().safeParse(characterId).success) notFound();
  const character = await getDatabase().character.findFirst({
    where: { id: characterId, workspaceId: member.workspaceId, deletedAt: null },
  });
  if (!character) notFound();
  return character;
}
