import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/client";
import { appConfig } from "@/config/app";
import { Prisma, type AuthTokenPurpose } from "@/generated/prisma/client";
import {
  hashPassword,
  randomToken,
  tokenDigest,
  verifyPassword,
} from "./crypto";
import {
  emailSchema,
  loginSchema,
  registrationSchema,
  resetSchema,
} from "./validation";
import { authEnvironment, SESSION_MAX_AGE } from "./config";
import { emailProvider } from "./email";
import { rateLimit } from "./rate-limit";

export class AuthFlowError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function authTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDatabase().$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      const cause = error instanceof Error && "cause" in error ? error.cause : null;
      const conflict = (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") ||
        (typeof cause === "object" && cause !== null && "originalCode" in cause && ["40001", "40P01"].includes(String(cause.originalCode)));
      if (conflict && attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
        continue;
      }
      throw error;
    }
  }
}

function workspaceCreate() {
  return {
    role: "OWNER" as const,
    workspace: {
      create: { name: "Личное пространство", slug: `personal-${randomUUID()}` },
    },
  };
}

export async function registerPassword(input: unknown) {
  const data = registrationSchema.parse(input);
  await rateLimit("register-email", data.email, 5);
  const passwordHash = await hashPassword(data.password);
  try {
    return await authTransaction((tx) =>
      tx.user.create({
        data: {
          name: data.email.split("@")[0].slice(0, 120),
          email: data.email,
          passwordCredential: { create: { passwordHash } },
          memberships: { create: workspaceCreate() },
        },
      }),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new AuthFlowError("RegistrationUnavailable");
    throw error;
  }
}

export async function authenticatePassword(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return null;
  await rateLimit("login-email", parsed.data.email);
  const user = await getDatabase().user.findUnique({
    where: { email: parsed.data.email },
    include: { passwordCredential: true },
  });
  if (
    !(await verifyPassword(
      user?.passwordCredential?.passwordHash,
      parsed.data.password,
    ))
  )
    return null;
  return user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.avatarUrl,
        authVersion: user.authVersion,
      }
    : null;
}

export type OAuthIdentity = {
  provider: string;
  providerAccountId: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};
export type LinkContext = {
  rawToken: string;
  userId: string;
  sessionId: string;
};

export async function resolveOAuthIdentity(
  identity: OAuthIdentity,
  link?: LinkContext,
) {
  if (
    !["yandex", "vk"].includes(identity.provider) ||
    !identity.providerAccountId ||
    identity.providerAccountId.length > 255
  )
    throw new AuthFlowError("OAuthFailed");
  try {
    return await authTransaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: identity.provider,
            providerAccountId: identity.providerAccountId,
          },
        },
        include: { user: true },
      });
      if (link) {
        const linkingUser = await tx.user.findUniqueOrThrow({
          where: { id: link.userId },
          include: { passwordCredential: { select: { id: true } } },
        });
        if (linkingUser.passwordCredential && !linkingUser.emailVerified)
          throw new AuthFlowError("EmailVerificationRequired");
        const intent = await tx.accountLinkIntent.findUnique({
          where: { tokenHash: tokenDigest(link.rawToken) },
        });
        const session = await tx.authSession.findUnique({
          where: { id: link.sessionId },
        });
        if (
          !intent ||
          intent.userId !== link.userId ||
          intent.sessionId !== link.sessionId ||
          intent.provider !== identity.provider ||
          intent.expiresAt <= new Date() ||
          session?.userId !== link.userId ||
          session.expiresAt <= new Date()
        )
          throw new AuthFlowError("LinkExpired");
        if (account && account.userId !== link.userId)
          throw new AuthFlowError("IdentityUnavailable");
        const other = await tx.account.findUnique({
          where: {
            userId_provider: {
              userId: link.userId,
              provider: identity.provider,
            },
          },
        });
        if (other && other.providerAccountId !== identity.providerAccountId)
          throw new AuthFlowError("IdentityUnavailable");
        if (!account)
          await tx.account.create({
            data: {
              userId: link.userId,
              type: "oauth",
              provider: identity.provider,
              providerAccountId: identity.providerAccountId,
            },
          });
        await tx.accountLinkIntent.delete({ where: { id: intent.id } });
        return tx.user.findUniqueOrThrow({ where: { id: link.userId } });
      }
      if (account) return account.user;
      const parsedEmail = emailSchema.safeParse(identity.email);
      const email = parsedEmail.success ? parsedEmail.data : null;
      // Email equality is never evidence of identity ownership.
      if (email && (await tx.user.findUnique({ where: { email } })))
        throw new AuthFlowError("OAuthAccountNotLinked");
      return tx.user.create({
        data: {
          name: (identity.name?.trim() || "Пользователь").slice(0, 120),
          email,
          avatarUrl: identity.image?.startsWith("https://")
            ? identity.image
            : null,
          memberships: { create: workspaceCreate() },
          accounts: {
            create: {
              type: "oauth",
              provider: identity.provider,
              providerAccountId: identity.providerAccountId,
            },
          },
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new AuthFlowError("IdentityUnavailable");
    throw error;
  }
}

export async function createAuthSession(userId: string, authVersion: number) {
  return authTransaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.authVersion !== authVersion)
      throw new AuthFlowError("SessionExpired");
    return tx.authSession.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
      },
    });
  });
}

export async function unlinkIdentity(userId: string, provider: string) {
  return authTransaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: { accounts: true, passwordCredential: true },
    });
    if (!user.accounts.some((account) => account.provider === provider)) return;
    if (user.accounts.length + (user.passwordCredential ? 1 : 0) <= 1)
      throw new AuthFlowError("LastLoginMethod");
    await tx.account.delete({
      where: { userId_provider: { userId, provider } },
    });
    // Revoke existing sessions and concurrent in-flight signins after unlink.
    await tx.user.update({
      where: { id: userId },
      data: { authVersion: { increment: 1 } },
    });
    await tx.authSession.deleteMany({ where: { userId } });
    await tx.accountLinkIntent.deleteMany({ where: { userId } });
  });
}

export async function issueEmailToken(
  userId: string,
  purpose: AuthTokenPurpose,
) {
  const sender = emailProvider(); // Fail closed in production, before creating a token.
  const user = await getDatabase().user.findUniqueOrThrow({
    where: { id: userId },
  });
  if (!user.email) throw new AuthFlowError("EmailRequired");
  const rawToken = randomToken();
  const token = await authTransaction(async (tx) => {
    await tx.authToken.deleteMany({ where: { userId, purpose } });
    return tx.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: tokenDigest(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
  });
  const path = purpose === "VERIFY_EMAIL" ? "/verify-email" : "/reset-password";
  try {
    await sender.send({
      to: user.email,
      subject:
        purpose === "VERIFY_EMAIL"
          ? `Подтвердите email ${appConfig.name}`
          : `Пароль ${appConfig.name}`,
      url: `${authEnvironment().origin}${path}?token=${rawToken}`,
    });
  } catch (error) {
    await getDatabase().authToken.deleteMany({ where: { id: token.id } });
    throw error;
  }
}

export async function requestPasswordReset(email: string) {
  await rateLimit("reset-email", email, 3);
  // Check delivery even for unknown accounts, avoiding divergent UI results.
  emailProvider();
  const user = await getDatabase().user.findUnique({
    where: { email },
    include: { passwordCredential: true },
  });
  if (user?.passwordCredential)
    await issueEmailToken(user.id, "RESET_PASSWORD");
}

export async function verifyEmailToken(rawToken: string) {
  if (!/^[a-f0-9]{64}$/.test(rawToken)) throw new AuthFlowError("TokenInvalid");
  return authTransaction(async (tx) => {
    const token = await tx.authToken.findUnique({
      where: { tokenHash: tokenDigest(rawToken) },
    });
    if (
      !token ||
      token.purpose !== "VERIFY_EMAIL" ||
      token.expiresAt <= new Date()
    )
      throw new AuthFlowError("TokenInvalid");
    await tx.authToken.delete({ where: { id: token.id } });
    await tx.user.update({
      where: { id: token.userId },
      data: { emailVerified: new Date() },
    });
  });
}

export async function resetPassword(input: unknown, currentUserId?: string) {
  const data = resetSchema.parse(input);
  await rateLimit("reset-token", tokenDigest(data.token), 5);
  const passwordHash = await hashPassword(data.password);
  return authTransaction(async (tx) => {
    const token = await tx.authToken.findUnique({
      where: { tokenHash: tokenDigest(data.token) },
    });
    if (
      !token ||
      token.expiresAt <= new Date() ||
      token.purpose === "VERIFY_EMAIL"
    )
      throw new AuthFlowError("TokenInvalid");
    if (token.purpose === "ADD_PASSWORD" && currentUserId !== token.userId)
      throw new AuthFlowError("SessionExpired");
    const credential = await tx.passwordCredential.findUnique({
      where: { userId: token.userId },
    });
    if (token.purpose === "RESET_PASSWORD" && !credential)
      throw new AuthFlowError("TokenInvalid");
    if (token.purpose === "ADD_PASSWORD" && credential)
      throw new AuthFlowError("TokenInvalid");
    await tx.passwordCredential.upsert({
      where: { userId: token.userId },
      create: { userId: token.userId, passwordHash },
      update: { passwordHash },
    });
    await tx.user.update({
      where: { id: token.userId },
      data: { emailVerified: new Date(), authVersion: { increment: 1 } },
    });
    await tx.authToken.deleteMany({ where: { userId: token.userId } });
    await tx.authSession.deleteMany({ where: { userId: token.userId } });
    await tx.accountLinkIntent.deleteMany({ where: { userId: token.userId } });
  });
}
