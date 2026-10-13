import "server-only";
import { createHmac } from "node:crypto";
import { getDatabase } from "@/db/client";
import { authEnvironment } from "./config";

export class RateLimitError extends Error {}

// PostgreSQL upsert is atomic and shared by processes; no raw email/IP stored.
export async function rateLimit(
  scope: string,
  identifier: string,
  limit = 8,
  seconds = 900,
) {
  const key = createHmac("sha256", authEnvironment().secret)
    .update(`${scope}:${identifier}`)
    .digest("hex");
  const rows = await getDatabase().$queryRaw<{ attempts: number }[]>`
    INSERT INTO "AuthRateLimit" ("key", "attempts", "expiresAt")
    VALUES (${key}, 1, NOW() + ${seconds} * INTERVAL '1 second')
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "AuthRateLimit"."expiresAt" <= NOW() THEN 1 ELSE "AuthRateLimit"."attempts" + 1 END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= NOW() THEN NOW() + ${seconds} * INTERVAL '1 second' ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "attempts"`;
  if (rows[0].attempts > limit) throw new RateLimitError();
}

export function clientKey(
  headers: Headers | Record<string, string | string[] | undefined>,
) {
  // Enable only behind a proxy that replaces (not appends to) this header.
  if (process.env.AUTH_TRUST_PROXY !== "true") return "local-or-untrusted";
  const value =
    headers instanceof Headers
      ? headers.get("x-real-ip")
      : headers["x-real-ip"];
  return typeof value === "string" ? value.slice(0, 100) : "unknown";
}
