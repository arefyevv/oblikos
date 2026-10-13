import "server-only";
import { decode } from "next-auth/jwt";
import { z } from "zod";

type SessionCookie = { name: string; value: string };
type SessionRecord = { userId: string; expiresAt: Date };

// Used only after normal Auth.js validation returned no session. This helper
// decides the login message; it never grants access or relaxes JWT validation.
export async function missingSessionStatus(
  cookies: SessionCookie[],
  environment: { secret: string; secure: boolean },
  findSession: (id: string) => Promise<SessionRecord | null>,
): Promise<"unauthenticated" | "expired"> {
  const name = environment.secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
  const chunks = cookies.filter((cookie) => cookie.name === name || new RegExp(`^${name.replace(/\./g, "\\.")}\\.\\d+$`).test(cookie.name));
  if (!chunks.length) return "unauthenticated";
  chunks.sort((a, b) => Number(a.name.split(".").at(-1) || 0) - Number(b.name.split(".").at(-1) || 0));
  const token = chunks.map((cookie) => cookie.value).join("");
  let payload;
  try {
    payload = await decode({ token, secret: environment.secret });
  } catch (error) {
    // jose checks JWE authenticity before expiry. A random/corrupt cookie cannot
    // produce this code; it fails decryption and gets the ordinary login page.
    return error instanceof Error && "code" in error && error.code === "ERR_JWT_EXPIRED"
      ? "expired" : "unauthenticated";
  }
  if (!z.uuid().safeParse(payload?.sid).success || !z.uuid().safeParse(payload?.sub).success) return "unauthenticated";
  const record = await findSession(payload!.sid!);
  return !record || record.userId !== payload!.sub || record.expiresAt <= new Date()
    ? "expired" : "unauthenticated";
}
