import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { getDatabase } from "../src/db/client";
import {
  registerPassword,
  authenticatePassword,
  resolveOAuthIdentity,
  createAuthSession,
  unlinkIdentity,
  issueEmailToken,
  verifyEmailToken,
  resetPassword,
  requestPasswordReset,
} from "../src/features/auth/service";
import { randomToken, tokenDigest } from "../src/features/auth/crypto";
import { emailProvider } from "../src/features/auth/email";
import { safeCallback, authEnvironment } from "../src/features/auth/config";
import { rateLimit } from "../src/features/auth/rate-limit";
import { authOptions } from "../src/features/auth/options";
import { vkProvider } from "../src/features/auth/providers";
import type { Session } from "next-auth";

const db = getDatabase();
const marker = randomUUID();
const email = `auth-test-${marker}@example.com`;
const password = `Test-password-${randomUUID()}`;
const users: string[] = [];
const workspaces: string[] = [];
let userId: string;
let oauthUserId: string;
const originalNodeEnv = process.env.NODE_ENV;
const originalEmailProvider = process.env.EMAIL_PROVIDER;
const mailFiles: string[] = [];

const testEnv: Record<string, string | undefined> = process.env;
before(() => {
  testEnv.NODE_ENV = "development";
  process.env.EMAIL_PROVIDER = "development";
});
after(async () => {
  try {
    const members = await db.workspaceMember.findMany({
      where: { userId: { in: users } },
    });
    workspaces.push(...members.map((member) => member.workspaceId));
    await db.workspaceMember.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
    for (const file of mailFiles) await unlink(file).catch(() => {});
  } finally {
    testEnv.NODE_ENV = originalNodeEnv;
    process.env.EMAIL_PROVIDER = originalEmailProvider;
    await db.$disconnect();
  }
});

async function mailToken(targetEmail: string, path: string) {
  const directory = join(process.cwd(), "artifacts", "dev-mail");
  const files = (await readdir(directory)).sort().reverse();
  for (const filename of files) {
    const fullPath = join(directory, filename);
    const message = JSON.parse(await readFile(fullPath, "utf8"));
    if (message.to === targetEmail) {
      if (!mailFiles.includes(fullPath)) mailFiles.push(fullPath);
      const url = new URL(message.url);
      if (url.pathname === path) return url.searchParams.get("token")!;
    }
  }
  throw new Error("Test email missing");
}

test("registration, UUID, normalization, atomic Workspace/OWNER and Argon2id", async () => {
  const user = await registerPassword({
    email: `  ${email.toUpperCase()}  `,
    password,
    confirmation: password,
  });
  userId = user.id;
  users.push(user.id);
  assert.equal(user.email, email);
  assert.equal(user.emailVerified, null);
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
  });
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].role, "OWNER");
  assert.equal(memberships[0].workspace.name, "Личное пространство");
  const credential = await db.passwordCredential.findUniqueOrThrow({
    where: { userId },
  });
  assert.ok(credential.passwordHash.startsWith("$argon2id$"));
  assert.notEqual(credential.passwordHash, password);
  await assert.rejects(
    registerPassword({ email, password, confirmation: password }),
    /RegistrationUnavailable/,
  );
  assert.equal(await db.workspaceMember.count({ where: { userId } }), 1);
});

test("password length boundaries, registration and login without character-class requirements", async () => {
  for (const [length, message] of [
    [7, "Пароль должен содержать не менее 8 символов."],
    [129, "Пароль не должен превышать 128 символов."],
  ] as const) {
    const value = "a".repeat(length);
    await assert.rejects(
      registerPassword({ email: `boundary-${length}-${marker}@example.com`, password: value, confirmation: value }),
      (error: unknown) => error instanceof Error && error.message.includes(message),
    );
  }
  for (const length of [8, 128]) {
    const value = "a".repeat(length);
    const boundaryEmail = `boundary-${length}-${marker}@example.com`;
    const user = await registerPassword({ email: boundaryEmail, password: value, confirmation: value });
    users.push(user.id);
    const credential = await db.passwordCredential.findUniqueOrThrow({ where: { userId: user.id } });
    assert.ok(credential.passwordHash.startsWith("$argon2id$"));
    assert.equal((await authenticatePassword({ email: boundaryEmail, password: value }))?.id, user.id);
  }
});

test("password verification, unknown account, weak password and mismatched confirmation", async () => {
  assert.equal((await authenticatePassword({ email, password }))?.id, userId);
  assert.equal(
    await authenticatePassword({ email, password: "wrong-password" }),
    null,
  );
  assert.equal(
    await authenticatePassword({
      email: `missing-${marker}@example.com`,
      password,
    }),
    null,
  );
  await assert.rejects(
    registerPassword({ email: "bad-email", password, confirmation: password }),
  );
  await assert.rejects(
    registerPassword({ email, password: "short", confirmation: "short" }),
  );
  await assert.rejects(
    registerPassword({ email, password, confirmation: "different" }),
  );
});

test("OAuth bootstrap is atomic; matching email cannot link; provider identities unique", async () => {
  await assert.rejects(
    resolveOAuthIdentity({
      provider: "yandex",
      providerAccountId: `collision-${marker}`,
      email,
    }),
    /OAuthAccountNotLinked/,
  );
  assert.equal(await db.account.count({ where: { userId } }), 0);
  const user = await resolveOAuthIdentity({
    provider: "yandex",
    providerAccountId: marker,
    email: `oauth-${marker}@example.com`,
    name: "OAuth Test",
  });
  oauthUserId = user.id;
  users.push(user.id);
  assert.notEqual(oauthUserId, userId);
  assert.equal(
    (
      await resolveOAuthIdentity({
        provider: "yandex",
        providerAccountId: marker,
      })
    ).id,
    oauthUserId,
  );
  assert.equal(
    await db.workspaceMember.count({
      where: { userId: oauthUserId, role: "OWNER" },
    }),
    1,
  );
  assert.equal(await db.account.count({ where: { userId: oauthUserId } }), 1);
});

test("explicit link requires active session, consumes intent once, rejects foreign identity", async () => {
  const session = await createAuthSession(userId, 0);
  const rawToken = randomToken();
  await db.accountLinkIntent.create({
    data: {
      userId,
      sessionId: session.id,
      provider: "vk",
      tokenHash: tokenDigest(rawToken),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  const context = { rawToken, userId, sessionId: session.id };
  await assert.rejects(
    resolveOAuthIdentity(
      { provider: "vk", providerAccountId: marker, email },
      context,
    ),
    /EmailVerificationRequired/,
  );
  await db.user.update({
    where: { id: userId },
    data: { emailVerified: new Date() },
  });
  assert.equal(
    (
      await resolveOAuthIdentity(
        { provider: "vk", providerAccountId: marker, email },
        context,
      )
    ).id,
    userId,
  );
  await assert.rejects(
    resolveOAuthIdentity(
      { provider: "vk", providerAccountId: marker },
      context,
    ),
    /LinkExpired/,
  );
  const foreignToken = randomToken();
  await db.accountLinkIntent.create({
    data: {
      userId,
      sessionId: session.id,
      provider: "yandex",
      tokenHash: tokenDigest(foreignToken),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  await assert.rejects(
    resolveOAuthIdentity(
      { provider: "yandex", providerAccountId: marker },
      { ...context, rawToken: foreignToken },
    ),
    /IdentityUnavailable/,
  );
  const expiredToken = randomToken();
  await db.accountLinkIntent.create({
    data: {
      userId,
      sessionId: session.id,
      provider: "yandex",
      tokenHash: tokenDigest(expiredToken),
      expiresAt: new Date(0),
    },
  });
  await assert.rejects(
    resolveOAuthIdentity(
      { provider: "yandex", providerAccountId: `new-${marker}` },
      { ...context, rawToken: expiredToken },
    ),
    /LinkExpired/,
  );
});

test("last login method cannot unlink; allowed unlink revokes sessions", async () => {
  await assert.rejects(
    unlinkIdentity(oauthUserId, "yandex"),
    /LastLoginMethod/,
  );
  await unlinkIdentity(userId, "vk");
  assert.equal(await db.account.count({ where: { userId } }), 0);
  assert.equal(await db.authSession.count({ where: { userId } }), 0);
  await assert.rejects(createAuthSession(userId, 0), /SessionExpired/);
});

test("verification token hashed, expires and is single use", async () => {
  await issueEmailToken(userId, "VERIFY_EMAIL");
  const raw = await mailToken(email, "/verify-email");
  const row = await db.authToken.findUniqueOrThrow({
    where: { tokenHash: tokenDigest(raw) },
  });
  assert.notEqual(row.tokenHash, raw);
  await verifyEmailToken(raw);
  assert.ok(
    (await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified,
  );
  await assert.rejects(verifyEmailToken(raw), /TokenInvalid/);
  const expired = randomToken();
  await db.authToken.create({
    data: {
      userId,
      purpose: "VERIFY_EMAIL",
      tokenHash: tokenDigest(expired),
      expiresAt: new Date(0),
    },
  });
  await assert.rejects(verifyEmailToken(expired), /TokenInvalid/);
});

test("password reset consumes token, changes password, revokes all sessions", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await createAuthSession(userId, user.authVersion);
  await requestPasswordReset(email);
  const raw = await mailToken(email, "/reset-password");
  const nextPassword = `New-password-${marker}`;
  await resetPassword({
    token: raw,
    password: nextPassword,
    confirmation: nextPassword,
  });
  assert.equal(await authenticatePassword({ email, password }), null);
  assert.equal(
    (await authenticatePassword({ email, password: nextPassword }))?.id,
    userId,
  );
  assert.equal(await db.authSession.count({ where: { userId } }), 0);
  await assert.rejects(
    resetPassword({
      token: raw,
      password: nextPassword,
      confirmation: nextPassword,
    }),
    /TokenInvalid/,
  );
});

test("adding password to OAuth account requires matching session user plus email possession", async () => {
  await issueEmailToken(oauthUserId, "ADD_PASSWORD");
  const raw = await mailToken(`oauth-${marker}@example.com`, "/reset-password");
  await assert.rejects(
    resetPassword({ token: raw, password, confirmation: password }, userId),
    /SessionExpired/,
  );
  await resetPassword(
    { token: raw, password, confirmation: password },
    oauthUserId,
  );
  assert.equal(
    (
      await authenticatePassword({
        email: `oauth-${marker}@example.com`,
        password,
      })
    )?.id,
    oauthUserId,
  );
});

test("Auth.js session reads registry, ignores client update, logout revokes", async () => {
  const options = authOptions();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await options.callbacks!.jwt!({
    token: {},
    user: { id: user.id, authVersion: user.authVersion },
    account: null,
  });
  assert.equal(token.sub, userId);
  assert.ok(token.sid);
  const unchanged = await options.callbacks!.jwt!({
    token,
    trigger: "update",
    session: { user: { id: oauthUserId }, sid: randomUUID() },
  } as Parameters<NonNullable<typeof options.callbacks>["jwt"] & object>[0]);
  assert.equal(unchanged.sub, userId);
  const context = {
    session: { user: { id: userId }, sessionId: token.sid!, expires: "" },
    token,
    user: { id: userId, email: "", emailVerified: null },
    newSession: undefined,
    trigger: "update" as const,
  };
  const session = await options.callbacks!.session!(context);
  assert.equal((session as Session).user.id, userId);
  await options.events!.signOut!({ token, session: session as Session });
  const absent = await options.callbacks!.session!({
    ...context,
    session: session as Session,
  });
  assert.equal(absent, null);
});

test("shared PostgreSQL limiter is atomic under simultaneous attempts", async () => {
  const responses = await Promise.allSettled(
    Array.from({ length: 12 }, () => rateLimit("integration", marker, 4)),
  );
  assert.equal(
    responses.filter((response) => response.status === "fulfilled").length,
    4,
  );
});

test("redirects confined to allowlist and production email adapter fails closed", () => {
  const base = "https://character.example";
  for (const target of [
    "https://evil.example",
    "//evil.example",
    "/api/auth/callback/vk",
    "javascript:alert(1)",
    "https://character.example@evil.example",
  ])
    assert.equal(safeCallback(target, base), `${base}/dashboard`);
  assert.equal(safeCallback("/settings", base), `${base}/settings`);
  assert.equal(safeCallback("/content/new", base), `${base}/content/new`);
  testEnv.NODE_ENV = "production";
  assert.throws(() => emailProvider());
  const previousUrl = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = base;
  assert.equal(authEnvironment().secure, true);
  process.env.NEXTAUTH_URL = previousUrl;
  testEnv.NODE_ENV = "development";
});

test("modern VK exchange validates state and PKCE; device_id forwarded server-side", async () => {
  const originalFetch = globalThis.fetch;
  const config = vkProvider("test-device");
  const endpoint = config.token;
  assert.ok(endpoint && typeof endpoint === "object" && endpoint.request);
  const request = endpoint.request;
  const context = {
    provider: {
      ...config,
      clientId: "123",
      callbackUrl: "https://character.example/api/auth/callback/vk",
      signinUrl: "",
    },
    params: { code: "code", state: "state" },
    checks: { state: "state", code_verifier: "verifier" },
    client: {},
  } as Parameters<typeof request>[0];
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://id.vk.ru/oauth2/auth");
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("device_id"), "test-device");
      assert.equal(body.get("code_verifier"), "verifier");
      assert.equal(body.get("client_secret"), null);
      return Response.json({
        access_token: "synthetic-test-token",
        state: "state",
        expires_in: 300,
      });
    };
    const response = await request(context);
    assert.equal(response.tokens.access_token, "synthetic-test-token");
    await assert.rejects(async () =>
      request({ ...context, params: { ...context.params, state: "wrong" } }),
    );
    globalThis.fetch = async () =>
      Response.json({ access_token: "synthetic-test-token", state: "wrong" });
    await assert.rejects(async () => request(context));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expired server session is rejected even with an otherwise valid JWT", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const session = await createAuthSession(userId, user.authVersion);
  await db.authSession.update({
    where: { id: session.id },
    data: { expiresAt: new Date(0) },
  });
  const options = authOptions();
  const result = await options.callbacks!.session!({
    session: { user: { id: userId }, sessionId: session.id, expires: "" },
    token: { sub: userId, sid: session.id },
    user: { id: userId, email: "", emailVerified: null },
    newSession: undefined,
    trigger: "update",
  });
  assert.equal(result, null);
});

test("concurrent unlinks cannot remove both remaining OAuth login methods", async () => {
  const user = await resolveOAuthIdentity({
    provider: "yandex",
    providerAccountId: `race-${marker}`,
  });
  users.push(user.id);
  const session = await createAuthSession(user.id, user.authVersion);
  const rawToken = randomToken();
  await db.accountLinkIntent.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      provider: "vk",
      tokenHash: tokenDigest(rawToken),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  await resolveOAuthIdentity(
    { provider: "vk", providerAccountId: `race-${marker}` },
    { userId: user.id, sessionId: session.id, rawToken },
  );
  const outcomes = await Promise.allSettled([
    unlinkIdentity(user.id, "yandex"),
    unlinkIdentity(user.id, "vk"),
  ]);
  assert.equal(
    outcomes.filter((outcome) => outcome.status === "fulfilled").length,
    1,
  );
  assert.equal(await db.account.count({ where: { userId: user.id } }), 1);
});
