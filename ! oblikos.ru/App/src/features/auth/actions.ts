"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import {
  currentSession,
  currentWorkspace,
  requireUser,
  requireWorkspaceMember,
  requireWorkspaceRole,
} from "./access";
import { authEnvironment, availableProviders, LINK_COOKIE } from "./config";
import { randomToken, tokenDigest } from "./crypto";
import { clientKey, rateLimit, RateLimitError } from "./rate-limit";
import { emailAvailable } from "./email";
import {
  AuthFlowError,
  issueEmailToken,
  registerPassword,
  requestPasswordReset,
  resetPassword,
  unlinkIdentity,
  verifyEmailToken,
} from "./service";
import { emailSchema, providerSchema } from "./validation";

export type ActionResult = {
  ok: boolean;
  message: string;
  provider?: "yandex" | "vk";
};
const flowMessages: Record<string, string> = {
  RegistrationUnavailable:
    "Не удалось создать аккаунт с этими данными. Попробуйте войти или восстановить пароль.",
  LastLoginMethod:
    "Нельзя отключить последний способ входа. Сначала добавьте другой.",
  TokenInvalid: "Ссылка недействительна или истекла. Запросите новую.",
  EmailRequired: "Для этого способа входа нужен email в профиле.",
  SessionExpired: "Войдите в аккаунт ещё раз.",
  EmailVerificationRequired:
    "Перед подключением провайдера подтвердите email в разделе «Способы входа».",
};
function failure(error: unknown): ActionResult {
  if (error instanceof z.ZodError)
    return {
      ok: false,
      message: error.issues[0]?.message || "Проверьте введённые данные.",
    };
  if (error instanceof RateLimitError)
    return {
      ok: false,
      message: "Слишком много попыток. Попробуйте через 15 минут.",
    };
  if (error instanceof AuthFlowError)
    return {
      ok: false,
      message:
        flowMessages[error.code] ||
        "Не удалось выполнить действие. Повторите попытку.",
    };
  return {
    ok: false,
    message: "Сервис временно недоступен. Повторите попытку позже.",
  };
}
async function guard(scope: string, limit = 30) {
  const requestHeaders = await headers();
  if (requestHeaders.get("origin") !== authEnvironment().origin)
    throw new AuthFlowError("Forbidden");
  await rateLimit(scope, clientKey(requestHeaders), limit);
}
export async function registerAction(form: FormData): Promise<ActionResult> {
  try {
    await guard("registration");
    const user = await registerPassword(Object.fromEntries(form));
    if (emailAvailable()) {
      try {
        await issueEmailToken(user.id, "VERIFY_EMAIL");
      } catch {
        /* Resend in settings. */
      }
    }
    return { ok: true, message: "Аккаунт создан." };
  } catch (error) {
    return failure(error);
  }
}
export async function forgotPasswordAction(
  form: FormData,
): Promise<ActionResult> {
  try {
    await guard("forgot-password");
    await requestPasswordReset(emailSchema.parse(form.get("email")));
    return {
      ok: true,
      message:
        "Если для этого email доступен вход по паролю, мы отправили ссылку восстановления.",
    };
  } catch (error) {
    if (error instanceof RateLimitError)
      return {
        ok: true,
        message:
          "Если для этого email доступен вход по паролю, мы отправили ссылку восстановления.",
      };
    return failure(error);
  }
}
export async function resetPasswordAction(
  form: FormData,
): Promise<ActionResult> {
  try {
    await guard("reset-password");
    const session = await currentSession();
    await resetPassword(Object.fromEntries(form), session?.user.id);
    return {
      ok: true,
      message:
        "Пароль сохранён. Все прежние сессии завершены. Войдите с новым паролем.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function verifyEmailAction(form: FormData): Promise<ActionResult> {
  try {
    await guard("verify-email");
    await verifyEmailToken(z.string().parse(form.get("token")));
    revalidatePath("/settings");
    return { ok: true, message: "Email подтверждён." };
  } catch (error) {
    return failure(error);
  }
}
export async function resendEmailAction(): Promise<ActionResult> {
  const session = await requireUser();
  try {
    await guard("resend-email");
    await rateLimit("resend-user", session.user.id, 3);
    const user = await getDatabase().user.findUniqueOrThrow({
      where: { id: session.user.id },
    });
    if (user.emailVerified)
      return { ok: true, message: "Email уже подтверждён." };
    await issueEmailToken(user.id, "VERIFY_EMAIL");
    return { ok: true, message: "Ссылка подтверждения отправлена." };
  } catch (error) {
    return failure(error);
  }
}
export async function addPasswordAction(): Promise<ActionResult> {
  const session = await requireUser();
  try {
    await guard("add-password");
    await rateLimit("add-password-user", session.user.id, 3);
    if (
      await getDatabase().passwordCredential.findUnique({
        where: { userId: session.user.id },
      })
    )
      return { ok: false, message: "Вход по паролю уже подключён." };
    await issueEmailToken(session.user.id, "ADD_PASSWORD");
    return {
      ok: true,
      message:
        "Ссылка для задания пароля отправлена на email профиля. Откройте её в этом браузере.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function linkProviderAction(
  providerInput: string,
): Promise<ActionResult> {
  const session = await requireUser();
  try {
    await guard("link-provider");
    const provider = providerSchema.parse(providerInput);
    if (!availableProviders()[provider])
      return { ok: false, message: "Этот способ входа пока не настроен." };
    const user = await getDatabase().user.findUniqueOrThrow({
      where: { id: session.user.id },
      include: { passwordCredential: { select: { id: true } } },
    });
    if (user.passwordCredential && !user.emailVerified)
      throw new AuthFlowError("EmailVerificationRequired");
    const rawToken = randomToken();
    await getDatabase().accountLinkIntent.create({
      data: {
        userId: session.user.id,
        sessionId: session.sessionId,
        provider,
        tokenHash: tokenDigest(rawToken),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    (await cookies()).set(LINK_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: authEnvironment().secure,
      path: "/",
      maxAge: 600,
    });
    return { ok: true, provider, message: "Переход к провайдеру…" };
  } catch (error) {
    return failure(error);
  }
}
export async function unlinkProviderAction(
  providerInput: string,
): Promise<ActionResult> {
  const session = await requireUser();
  try {
    await guard("unlink-provider");
    await unlinkIdentity(session.user.id, providerSchema.parse(providerInput));
    (await cookies()).delete(LINK_COOKIE);
    revalidatePath("/settings");
    return {
      ok: true,
      message: "Способ входа отключён. Войдите снова для продолжения.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function updateProfileAction(
  form: FormData,
): Promise<ActionResult> {
  const session = await requireUser();
  try {
    await guard("profile");
    const name = z
      .string()
      .trim()
      .min(1, "Введите имя.")
      .max(120, "Имя слишком длинное.")
      .parse(form.get("name"));
    await getDatabase().user.update({
      where: { id: session.user.id },
      data: { name },
    });
    revalidatePath("/settings");
    return { ok: true, message: "Профиль сохранён." };
  } catch (error) {
    return failure(error);
  }
}
export async function updateWorkspaceAction(
  form: FormData,
): Promise<ActionResult> {
  const current = await currentWorkspace();
  await requireWorkspaceRole(current.workspaceId, ["OWNER", "ADMIN"]);
  try {
    await guard("workspace");
    const name = z
      .string()
      .trim()
      .min(1, "Введите название.")
      .max(120, "Название слишком длинное.")
      .parse(form.get("name"));
    await getDatabase().workspace.update({
      where: { id: current.workspaceId },
      data: { name },
    });
    revalidatePath("/settings");
    return { ok: true, message: "Пространство сохранено." };
  } catch (error) {
    return failure(error);
  }
}
export async function switchWorkspaceAction(
  form: FormData,
): Promise<ActionResult> {
  await requireUser();
  const member = await requireWorkspaceMember(
    z.uuid().parse(form.get("workspaceId")),
  );
  try {
    await guard("switch-workspace");
    (await cookies()).set("oblikos.workspace", member.workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: authEnvironment().secure,
      path: "/",
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Пространство выбрано." };
  } catch (error) {
    return failure(error);
  }
}
