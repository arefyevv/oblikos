import "server-only";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { getDatabase } from "@/db/client";
import {
  authEnvironment,
  availableProviders,
  LINK_COOKIE,
  safeCallback,
  SESSION_MAX_AGE,
} from "./config";
import {
  authenticatePassword,
  AuthFlowError,
  createAuthSession,
  resolveOAuthIdentity,
} from "./service";
import { yandexProvider, vkProvider } from "./providers";
import { rateLimit, clientKey } from "./rate-limit";

// CJS interop differs between Next.js bundling and Node integration tests.
const CredentialsProvider =
  typeof Credentials === "function"
    ? Credentials
    : (Credentials as { default: typeof Credentials }).default;

export function authOptions(request?: NextRequest): NextAuthOptions {
  const env = authEnvironment();
  const enabled = availableProviders();
  return {
    secret: env.secret,
    useSecureCookies: env.secure,
    debug: false,
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
    pages: { signIn: "/login", error: "/login" },
    providers: [
      CredentialsProvider({
        name: "Email и пароль",
        credentials: {
          email: { type: "email" },
          password: { type: "password" },
        },
        async authorize(credentials, req) {
          try {
            await rateLimit("login-ip", clientKey(req.headers || {}), 60);
            return await authenticatePassword(credentials);
          } catch {
            return null;
          } // Same public error for unknown / wrong / throttled credentials.
        },
      }),
      ...(enabled.yandex ? [yandexProvider()] : []),
      ...(enabled.vk
        ? [vkProvider(request?.nextUrl.searchParams.get("device_id"))]
        : []),
    ],
    callbacks: {
      redirect: ({ url, baseUrl }) => safeCallback(url, baseUrl),
      async signIn({ user, account }) {
        if (account?.type !== "oauth") return true;
        try {
          const rawToken = request?.cookies.get(LINK_COOKIE)?.value;
          let link;
          if (rawToken && request) {
            const current = await getToken({
              req: request,
              secret: env.secret,
              secureCookie: env.secure,
            });
            if (!current?.sub || !current.sid)
              throw new AuthFlowError("LinkExpired");
            link = { rawToken, userId: current.sub, sessionId: current.sid };
          }
          const resolved = await resolveOAuthIdentity(
            {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              name: user.name,
              email: user.email,
              image: user.image,
            },
            link,
          );
          user.id = resolved.id;
          user.name = resolved.name;
          user.email = resolved.email;
          user.image = resolved.avatarUrl;
          user.authVersion = resolved.authVersion;
          return true;
        } catch (error) {
          const code =
            error instanceof AuthFlowError ? error.code : "OAuthFailed";
          return `${env.origin}/login?error=${encodeURIComponent(code)}`;
        }
      },
      async jwt({ token, user }) {
        if (user) {
          if (user.authVersion === undefined)
            throw new AuthFlowError("SessionExpired");
          const session = await createAuthSession(user.id, user.authVersion);
          return { sub: user.id, sid: session.id }; // Minimal encrypted payload.
        }
        return token; // Never merge session.update() data supplied by the client.
      },
      async session({ session, token }) {
        const record =
          token.sid && token.sub
            ? await getDatabase().authSession.findUnique({
                where: { id: token.sid },
                include: { user: true },
              })
            : null;
        if (
          !record ||
          record.userId !== token.sub ||
          record.expiresAt <= new Date()
        ) {
          // Auth.js treats null as an absent session. Type surface expects Session.
          return null!;
        }
        session.user = {
          id: record.user.id,
          name: record.user.name,
          email: record.user.email,
          image: record.user.avatarUrl,
        };
        session.sessionId = record.id;
        session.expires = record.expiresAt.toISOString();
        return session;
      },
    },
    events: {
      async signOut({ token }) {
        if (token?.sid)
          await getDatabase().authSession.deleteMany({
            where: { id: token.sid },
          });
      },
    },
    // Auth.js default error metadata can contain provider tokens. Log codes only.
    logger: {
      error(code) {
        console.error(`[auth] ${code}`);
      },
      warn(code) {
        console.warn(`[auth] ${code}`);
      },
      debug() {},
    },
  };
}
