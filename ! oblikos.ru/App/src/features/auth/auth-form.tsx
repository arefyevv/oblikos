"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { appConfig } from "@/config/app";
import {
  forgotPasswordAction,
  registerAction,
  resetPasswordAction,
  verifyEmailAction,
  type ActionResult,
} from "./actions";
import { loginErrors } from "./messages";
import { emailSchema, loginSchema, registrationSchema, resetSchema, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "./validation";
type Mode = "login" | "register" | "forgot" | "reset" | "verify";
type Field = "email" | "password" | "confirmation";
const loadingLabels: Record<Mode, string> = {
  login: "Входим...",
  register: "Создаём аккаунт...",
  forgot: "Отправляем...",
  reset: "Сохраняем...",
  verify: "Подтверждаем...",
};
const titles: Record<Mode, string> = {
  login: `Войти в ${appConfig.name}`,
  register: "Создать аккаунт",
  forgot: "Восстановить пароль",
  reset: "Задать новый пароль",
  verify: "Подтвердить email",
};
export function AuthForm({
  mode,
  providers = { yandex: false, vk: false },
  error,
  token = "",
  emailEnabled = false,
}: {
  mode: Mode;
  providers?: { yandex: boolean; vk: boolean };
  error?: string;
  token?: string;
  emailEnabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [finished, setFinished] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const router = useRouter();
  function fieldProps(name: Field) {
    return {
      id: `auth-${name}`,
      "aria-invalid": Boolean(fieldErrors[name]),
      "aria-describedby": `auth-${name}-feedback`,
      onChange: () => setFieldErrors((previous) => ({ ...previous, [name]: undefined })),
    };
  }
  function feedback(name: Field, hint?: string) {
    return (
      <p id={`auth-${name}-feedback`} className={`auth-field-feedback ${fieldErrors[name] ? "auth-field-feedback--error" : "form-hint"}`} aria-live="polite">
        {fieldErrors[name] || hint || "\u00a0"}
      </p>
    );
  }
  const message =
    result?.message ||
    (error === "ProviderUnavailable"
      ? "Не удалось войти этим способом. Попробуйте другой."
      : error ? loginErrors[error] || "Не удалось войти. Повторите попытку." : "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setResult(null);
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form);
    const validation = mode === "register"
      ? registrationSchema.safeParse(data)
      : mode === "login"
        ? loginSchema.safeParse(data)
        : mode === "reset"
          ? resetSchema.safeParse(data)
          : mode === "forgot"
            ? emailSchema.safeParse(data.email)
            : null;
    if (validation && !validation.success) {
      const errors: Partial<Record<Field, string>> = {};
      for (const issue of validation.error.issues) {
        const name = (mode === "forgot" ? "email" : issue.path[0]) as Field;
        if (!["email", "password", "confirmation"].includes(name)) continue;
        errors[name] ??= !data[name]
          ? name === "email" ? "Введите email." : name === "password" ? "Введите пароль." : "Повторите пароль."
          : name === "password" && String(data[name]).length > PASSWORD_MAX_LENGTH
            ? "Пароль не должен превышать 128 символов."
            : issue.message;
      }
      setFieldErrors(errors);
      const first = Object.keys(errors)[0];
      if (first) event.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      else setResult({ ok: false, message: "Ссылка недействительна или истекла. Запросите новую." });
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      if (mode === "register") {
        const registered = await registerAction(form);
        if (!registered.ok) {
          setResult(registered);
          return;
        }
      }
      if (mode === "login" || mode === "register") {
        const response = await signIn("credentials", {
          email: String(form.get("email")),
          password: String(form.get("password")),
          callbackUrl: "/dashboard",
          redirect: false,
        });
        if (!response?.ok || response.error) {
          setResult({
            ok: false,
            message:
              mode === "register"
                ? "Аккаунт создан, но войти не удалось. Откройте страницу входа."
                : loginErrors.CredentialsSignin,
          });
          return;
        }
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      const response =
        mode === "forgot"
          ? await forgotPasswordAction(form)
          : mode === "reset"
            ? await resetPasswordAction(form)
            : await verifyEmailAction(form);
      setResult(response);
      if (response.ok) setFinished(true);
    } catch {
      setResult({
        ok: false,
        message:
          "Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.",
      });
    } finally {
      setPending(false);
    }
  }
  async function oauth(provider: "yandex" | "vk") {
    setPending(true);
    try {
      await signIn(provider, { callbackUrl: "/dashboard" });
    } catch {
      setResult({ ok: false, message: "Не удалось открыть провайдера входа." });
      setPending(false);
    }
  }
  return (
    <Card className="auth-card">
      <h1>{titles[mode]}</h1>
      {message && (
        <p
          className={`form-message ${result?.ok ? "form-message--success" : ""}`}
          role={result?.ok ? "status" : "alert"}
        >
          {message}
        </p>
      )}
      {!finished && (
        <form className="auth-form" onSubmit={submit} aria-busy={pending} noValidate>
          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <div className="form-field">
              <label htmlFor="auth-email">Email</label>
              <input
                {...fieldProps("email")}
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                disabled={pending}
              />
              {feedback("email")}
            </div>
          )}
          {(mode === "login" || mode === "register" || mode === "reset") && (
            <div className="form-field">
              <label htmlFor="auth-password">Пароль</label>
              <PasswordInput
                {...fieldProps("password")}
                name="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "login" ? 1 : PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                required
                disabled={pending}
              />
              {feedback("password", mode === "register" || mode === "reset" ? "Минимум 8 символов." : undefined)}
              {mode === "login" && emailEnabled && (
                <Link className="text-link auth-forgot" href="/forgot-password">
                  Забыли пароль?
                </Link>
              )}
            </div>
          )}
          {(mode === "register" || mode === "reset") && (
            <>
              <div className="form-field">
                <label htmlFor="auth-confirmation">Повторите пароль</label>
                <PasswordInput
                  {...fieldProps("confirmation")}
                  name="confirmation"
                  visibilityLabel="повтор пароля"
                  autoComplete="new-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  required
                  disabled={pending}
                />
                {feedback("confirmation")}
              </div>
            </>
          )}
          {(mode === "reset" || mode === "verify") && (
            <input name="token" type="hidden" value={token} />
          )}
          {mode === "verify" && (
            <p className="form-hint">
              Нажмите кнопку, чтобы подтвердить адрес электронной почты.
            </p>
          )}
          <Button
            type="submit"
            aria-busy={pending}
            disabled={
              pending ||
              (mode === "forgot" && !emailEnabled) ||
              ((mode === "reset" || mode === "verify") && !token)
            }
          >
            {pending
              ? loadingLabels[mode]
              : mode === "login"
                ? "Войти"
                : mode === "register"
                  ? "Создать аккаунт"
                  : mode === "forgot"
                    ? "Отправить ссылку"
                    : mode === "reset"
                      ? "Сохранить пароль"
                      : "Подтвердить email"}
          </Button>
        </form>
      )}
      {mode === "forgot" && !emailEnabled && (
        <p className="form-hint">
          Отправка писем пока не настроена. Восстановление пароля станет
          доступно после подключения почты.
        </p>
      )}
      {(mode === "login" || mode === "register") && (
        <>
          <div className="auth-divider">
            <span>или</span>
          </div>
          <div className="oauth-buttons">
            <Button
              variant="secondary"
              className="oauth-button oauth-button--yandex"
              disabled={!providers.yandex || pending}
              onClick={() => oauth("yandex")}
            >
              <span className="oauth-button__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <circle cx="12" cy="12" r="12" fill="#fc3f1d" />
                  <path fill="#fff" d="M13.7 5H12c-3.1 0-4.7 1.6-4.7 4.1 0 2 1 3.2 2.8 4.5L7 19h2.7l3.4-6.1-1.3-.9c-1.5-1-2.2-1.8-2.2-3.1 0-1.4.9-2.3 2.4-2.3h1.1V19h2.4V5z" />
                </svg>
              </span>
              <span>Продолжить с Яндекс ID</span>
            </Button>
            <Button
              variant="secondary"
              className="oauth-button oauth-button--vk"
              disabled={!providers.vk || pending}
              onClick={() => oauth("vk")}
            >
              <span className="oauth-button__icon" aria-hidden="true">
                <svg viewBox="4 4 16 16" fill="currentColor" focusable="false">
                  <path d="M6 8.5c.09636 4.6823 2.55576 7.5 6.6095 7.5h.2351v-2.6787c1.4764.1499 2.5773 1.2536 3.0268 2.6787H18c-.5775-2.1318-2.0747-3.3105-3.0052-3.7608.9298-.5569 2.2458-1.9071 2.5557-3.7392H15.614c-.4064 1.48991-1.6152 2.8401-2.7701 2.9683V8.5h-1.9675v5.1967C9.67903 13.397 8.11709 11.9395 8.05309 8.5z" />
                </svg>
              </span>
              <span>Продолжить с VK ID</span>
            </Button>
          </div>
        </>
      )}
      <p className="auth-footer">
        {mode === "login" ? (
          <>
            Нет аккаунта?{" "}
            <Link className="text-link" href="/register">
              Создать аккаунт
            </Link>
          </>
        ) : mode === "register" ? (
          <>
            Уже есть аккаунт?{" "}
            <Link className="text-link" href="/login">
              Войти
            </Link>
          </>
        ) : (
          <Link className="text-link" href="/login">
            Вернуться ко входу
          </Link>
        )}
      </p>
    </Card>
  );
}
