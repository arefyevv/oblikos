"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  addPasswordAction,
  linkProviderAction,
  resendEmailAction,
  switchWorkspaceAction,
  unlinkProviderAction,
  updateProfileAction,
  updateWorkspaceAction,
  type ActionResult,
} from "./actions";

export function SettingsForm({
  kind,
  name,
  editable = true,
  workspaces,
  currentId,
  role,
}: {
  kind: "profile" | "workspace" | "switch";
  name?: string;
  editable?: boolean;
  workspaces?: { id: string; name: string }[];
  currentId?: string;
  role?: string;
}) {
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const [savedValue, setSavedValue] = useState(name ?? "");
  const changed = kind === "switch" || value.trim() !== savedValue.trim();
  const [result, setResult] = useState<ActionResult | null>(null);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !editable || !changed) return;
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response =
        kind === "profile"
          ? await updateProfileAction(form)
          : kind === "workspace"
            ? await updateWorkspaceAction(form)
            : await switchWorkspaceAction(form);
      setResult(response);
      if (response.ok) {
        setSavedValue(value.trim());
        router.refresh();
      }
    } catch {
      setResult({
        ok: false,
        message:
          "Не удалось сохранить. Проверьте соединение и повторите попытку.",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="settings-form" onSubmit={submit} aria-busy={pending}>
      {kind === "switch" ? (
        <label className="form-field">
          Текущее пространство
          <select
            name="workspaceId"
            defaultValue={currentId}
            disabled={pending}
          >
            {workspaces?.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="form-field">
          {kind === "profile" ? "Имя" : "Название"}
          <input
            name="name"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setResult(null);
            }}
            maxLength={120}
            required
            disabled={pending || !editable}
          />
        </label>
      )}
      {role && (
        <div className="settings-value">
          <span className="settings-value__label">Ваша роль</span>
          <div><Badge variant="accent">{role}</Badge></div>
        </div>
      )}
      {editable && (
        <Button type="submit" variant="secondary" disabled={pending || !changed || (kind !== "switch" && !value.trim())}>
          {pending
            ? "Сохранение…"
            : kind === "switch"
              ? "Выбрать"
              : "Сохранить изменения"}
        </Button>
      )}
      {result && (
        <p className="form-message" role={result.ok ? "status" : "alert"}>
          {result.message}
        </p>
      )}
    </form>
  );
}

export function LoginMethods({
  passwordConnected,
  email,
  emailVerified,
  providers,
  linked,
  emailEnabled,
}: {
  passwordConnected: boolean;
  email: string | null;
  emailVerified: boolean;
  providers: { yandex: boolean; vk: boolean };
  linked: string[];
  emailEnabled: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  async function run(operation: () => Promise<ActionResult>, redirect = false) {
    setPending(true);
    setResult(null);
    try {
      const response = await operation();
      setResult(response);
      if (response.ok && response.provider)
        await signIn(response.provider, { callbackUrl: "/settings" });
      else if (response.ok && redirect) {
        router.replace("/login");
        router.refresh();
      }
    } catch {
      setResult({
        ok: false,
        message: "Не удалось выполнить действие. Повторите попытку.",
      });
    } finally {
      setPending(false);
    }
  }
  const count = linked.length + (passwordConnected ? 1 : 0);
  const router = useRouter();
  return (
    <div className="settings-login-methods" aria-busy={pending}>
      {result && (
        <p className="form-message" role={result.ok ? "status" : "alert"}>
          {result.message}
        </p>
      )}
      <div className="login-method">
        <div>
          <strong>Email и пароль</strong>
        </div>
        {passwordConnected ? (
          <Badge variant="accent">Подключено</Badge>
        ) : (
          <Button
            variant="secondary"
            disabled={pending || !email || !emailEnabled}
            onClick={() => run(addPasswordAction)}
          >
            Добавить пароль
          </Button>
        )}
      </div>
      {email && !emailVerified && (
        <div className="login-method">
          <div>
            <span className="form-hint">Email не подтверждён</span>
          </div>
          {!emailVerified && (
            <Button
              variant="quiet"
              disabled={pending || !emailEnabled}
              onClick={() => run(resendEmailAction)}
            >
              Подтвердить email
            </Button>
          )}
        </div>
      )}
      {(["yandex", "vk"] as const).map((provider) => (
        <div className="login-method" key={provider}>
          <div>
            <strong>{provider === "yandex" ? "Яндекс ID" : "VK ID"}</strong>
            <span className="form-hint">
              {!linked.includes(provider) && !providers[provider] ? "Не настроено" : null}
            </span>
          </div>
          {linked.includes(provider) ? (
            <div className="login-method__actions">
            <Badge variant="accent">Подключено</Badge>
            <Button
              variant="quiet"
              disabled={pending || count <= 1}
              onClick={() => run(() => unlinkProviderAction(provider), true)}
            >
              Отключить
            </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              disabled={pending || !providers[provider]}
              onClick={() => run(() => linkProviderAction(provider))}
            >
              Подключить
            </Button>
          )}
        </div>
      ))}
      {count <= 1 && (
        <p className="form-hint">Последний способ входа нельзя отключить.</p>
      )}
      {passwordConnected && !emailVerified && (
        <p className="form-hint">
          Чтобы подключить OAuth к аккаунту с паролем, сначала подтвердите
          email.
        </p>
      )}
      {!emailEnabled && (
        <p className="form-hint">
          Отправка писем пока не настроена: подтверждение email, добавление и
          восстановление пароля по письму недоступны.
        </p>
      )}
    </div>
  );
}
