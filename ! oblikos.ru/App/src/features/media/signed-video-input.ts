import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { authEnvironment } from "@/features/auth/config";
import { getDatabase } from "@/db/client";
import { VideoError } from "@/features/ai/video-types";
import type { StorageProvider } from "./storage";

const claimsSchema = z.strictObject({ job: z.uuid(), kind: z.enum(["IMAGE", "VIDEO"]), expires: z.number().int().positive() });
const lifetime = 3 * 60 * 60 * 1000;
function signature(payload: string) { return createHmac("sha256", authEnvironment().secret).update(`video-input:v1:${payload}`).digest(); }

export function signVideoInput(job: string, kind: "IMAGE" | "VIDEO", now = Date.now()) {
  const payload = Buffer.from(JSON.stringify(claimsSchema.parse({ job, kind, expires: now + lifetime }))).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function verifyVideoInput(token: string, now = Date.now()) {
  // Some video providers validate the URL extension before fetching bytes.
  // The suffix is cosmetic; ownership, expiry and revocation still use HMAC.
  const suffix = token.match(/\.(mp4|png|jpg|webp)$/)?.[1];
  if (suffix) token = token.slice(0, -(suffix.length + 1));
  if (token.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new VideoError("source");
  const [payload, proof] = token.split("."), actual = Buffer.from(proof, "base64url"), expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new VideoError("source");
  const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (suffix && (claims.kind === "VIDEO" ? suffix !== "mp4" : suffix === "mp4")) throw new VideoError("source");
  if (claims.expires <= now || claims.expires > now + lifetime) throw new VideoError("source");
  return claims;
}
export function videoInputUrls(job: string) {
  const { origin } = authEnvironment();
  // Localhost cannot be fetched by the model. Development retains data URLs;
  // production uses these narrowly scoped, revocable bearer links instead.
  if (process.env.NODE_ENV !== "production" || !origin.startsWith("https://")) return undefined;
  return { image: `${origin}/api/ai-inputs/${signVideoInput(job, "IMAGE")}.png`, video: `${origin}/api/ai-inputs/${signVideoInput(job, "VIDEO")}.mp4` };
}
export function assertOwnVideoInputUrl(raw: string) {
  const url = new URL(raw), { origin } = authEnvironment();
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith("/api/ai-inputs/")) throw new VideoError("invalid");
  verifyVideoInput(url.pathname.slice("/api/ai-inputs/".length));
  return url.href;
}
export async function signedVideoInputResponse(token: string, storage: StorageProvider, head = false) {
  try {
    const claims = verifyVideoInput(token), db = getDatabase();
    const job = await db.mediaGeneration.findFirst({ where: { id: claims.job, type: "VIDEO", mode: "PERFORMANCE", provider: "aitunnel-motion", status: { in: ["PENDING", "PROCESSING"] }, character: { deletedAt: null, status: { not: "ARCHIVED" } } } });
    if (!job?.creatorUserId || !await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: job.workspaceId, userId: job.creatorUserId } } })) throw new VideoError("source");
    const file = claims.kind === "IMAGE"
      ? await db.mediaAsset.findFirst({ where: { id: job.referenceAssetId || "", workspaceId: job.workspaceId, characterId: job.characterId, type: "IMAGE", deletedAt: null } })
      : await db.videoSource.findFirst({ where: { id: job.sourceId || "", workspaceId: job.workspaceId, characterId: job.characterId, userId: job.creatorUserId, kind: "VIDEO", expiresAt: { gt: new Date() } } });
    if (!file) throw new VideoError("source");
    const bytes = await storage.read(file.storageKey);
    // Always return the complete file with 200, even for Range requests. Some
    // model fetchers reject a temporary storage URL's 206 as a download error.
    return new Response(head ? null : new Uint8Array(bytes), { headers: {
      "Content-Type": file.mimeType, "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff", "Accept-Ranges": "none",
      "Content-Disposition": `inline; filename="reference.${claims.kind === "VIDEO" ? "mp4" : file.mimeType === "image/png" ? "png" : file.mimeType === "image/webp" ? "webp" : "jpg"}"`,
    } });
  } catch { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
