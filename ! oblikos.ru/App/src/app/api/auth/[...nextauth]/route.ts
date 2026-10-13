import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/features/auth/options";
import {
  authEnvironment,
  availableProviders,
  LINK_COOKIE,
} from "@/features/auth/config";
import {
  clientKey,
  rateLimit,
  RateLimitError,
} from "@/features/auth/rate-limit";

export const runtime = "nodejs";

async function handler(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const { nextauth } = await context.params;
  try {
    const env = authEnvironment();
    const [action, provider] = nextauth;
    const sensitive = request.method === "POST" || action === "callback";
    if (sensitive)
      await rateLimit(
        "auth-endpoint",
        clientKey(request.headers),
        process.env.AUTH_TRUST_PROXY === "true" ? 60 : 300,
      );
    if (
      request.method === "POST" &&
      request.headers.get("origin") !== env.origin
    )
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (
      provider &&
      ["yandex", "vk"].includes(provider) &&
      !availableProviders()[provider as "yandex" | "vk"]
    ) {
      return NextResponse.redirect(
        `${env.origin}/login?error=ProviderUnavailable`,
      );
    }
    // Cancellation still uses the verified same-origin destination; no raw provider message.
    if (action === "callback" && request.nextUrl.searchParams.has("error")) {
      const errorCode =
        request.nextUrl.searchParams.get("error") === "access_denied"
          ? "OAuthCancelled"
          : "OAuthFailed";
      const response = NextResponse.redirect(
        `${env.origin}/login?error=${errorCode}`,
      );
      response.cookies.delete(LINK_COOKIE);
      return response;
    }
    const options = authOptions(request);
    let logoutFailed = false;
    const signOutEvent = options.events?.signOut;
    if (action === "signout" && signOutEvent) {
      options.events = {
        ...options.events,
        async signOut(message) {
          try {
            await signOutEvent(message);
          } catch {
            logoutFailed = true;
            throw new Error("SessionRevokeFailed");
          }
        },
      };
    }
    const response: Response = await NextAuth(options)(request, context);
    // Auth.js catches event errors. Don't return a successful logout or cookie
    // removal if its server-side registry record could not be revoked.
    if (logoutFailed)
      return NextResponse.json(
        { error: "Не удалось завершить сессию. Повторите выход." },
        { status: 503 },
      );
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    if (action === "callback") {
      response.headers.append(
        "Set-Cookie",
        `${LINK_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.secure ? "; Secure" : ""}`,
      );
    }
    if (action === "callback" || action === "signout") {
      response.headers.append(
        "Set-Cookie",
        `oblikos.workspace=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.secure ? "; Secure" : ""}`,
      );
    }
    if (action === "signout") {
      response.headers.append(
        "Set-Cookie",
        `${LINK_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.secure ? "; Secure" : ""}`,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof RateLimitError)
      return NextResponse.json(
        { error: "Слишком много попыток. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    return NextResponse.json(
      { error: "Сервис входа временно недоступен." },
      { status: 503 },
    );
  }
}

export { handler as GET, handler as POST };
