import type { Metadata } from "next";
import Image from "next/image";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDatabase } from "@/db/client";
import { currentWorkspace, requireUser } from "@/features/auth/access";
import { availableProviders } from "@/features/auth/config";
import { emailAvailable } from "@/features/auth/email";
import { LoginMethods, SettingsForm } from "@/features/auth/settings-forms";

export const metadata: Metadata = { title: "Настройки" };
export default async function SettingsPage() {
  const session = await requireUser();
  const member = await currentWorkspace();
  const user = await getDatabase().user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: {
      accounts: true,
      passwordCredential: { select: { id: true } },
      memberships: {
        include: { workspace: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const roles = {
    OWNER: "Владелец",
    ADMIN: "Администратор",
    MEMBER: "Участник",
  };
  return (
    <>
      <PageHeader
        title="Настройки"
        description="Управление аккаунтом, рабочим пространством и способами входа."
      />
      <Card className="settings-panel">
        <h2>Профиль</h2>
        {user.avatarUrl && (
          <Image
            className="profile-avatar"
            src={user.avatarUrl}
            alt="Фото профиля"
            width={64}
            height={64}
            unoptimized
            referrerPolicy="no-referrer"
          />
        )}
        <div className="settings-value">
          <span className="settings-value__label">Email</span>
          <div className="settings-value__row">
            <span>{user.email || "Email не указан"}</span>
            {user.email && (
              <Badge variant={user.emailVerified ? "accent" : "neutral"}>
                {user.emailVerified ? "Подтверждён" : "Не подтверждён"}
              </Badge>
            )}
          </div>
        </div>
        <SettingsForm key={user.name} kind="profile" name={user.name} />
      </Card>
      <Card className="settings-panel">
        <h2>Рабочее пространство</h2>
        <SettingsForm
          key={`${member.workspaceId}:${member.workspace.name}`}
          kind="workspace"
          name={member.workspace.name}
          role={roles[member.role]}
          editable={member.role === "OWNER" || member.role === "ADMIN"}
        />
        {user.memberships.length > 1 && (
          <SettingsForm
            kind="switch"
            workspaces={user.memberships.map((item) => ({
              id: item.workspaceId,
              name: item.workspace.name,
            }))}
            currentId={member.workspaceId}
          />
        )}
      </Card>
      <Card className="settings-panel">
        <h2>Способы входа</h2>
        <LoginMethods
          passwordConnected={Boolean(user.passwordCredential)}
          email={user.email}
          emailVerified={Boolean(user.emailVerified)}
          providers={availableProviders()}
          linked={user.accounts.map((account) => account.provider)}
          emailEnabled={emailAvailable()}
        />
      </Card>
    </>
  );
}
