import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "../src/db/client";
import { createMediaService } from "../src/features/media/operations";
import { LocalStorageProvider } from "../src/features/media/storage";
import { inspectImage } from "../src/features/media/image-file";
import { OpenAICompatibleImageProvider } from "../src/features/ai/image-provider";
import { ImageError, imageMessages } from "../src/features/ai/image-types";

// Explicit live smoke only. Never invoked by automated tests. Persistent marker
// and transport guard prevent an accidental second paid request, even on failure.
const artifact = process.argv[3] || "artifacts/image-live-smoke.json";
const characterId = process.argv[2];
const key = process.env.OPENAI_API_KEY?.trim();
const baseURL = process.env.OPENAI_BASE_URL?.trim();
const model = process.env.OPENAI_IMAGE_MODEL?.trim();
if (!characterId || !key || !baseURL || !model) throw new Error("Character ID and image environment must be configured.");
// A misconfigured model field can itself contain a credential. Never log it.
if (model === key || /^sk[-_]/i.test(model)) throw new Error("OPENAI_IMAGE_MODEL looks like an API credential; configure a model identifier. No request sent.");
const base = new URL(baseURL);
if (base.hostname !== "api.proxyapi.ru" || base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Live smoke requires the configured HTTPS ProxyAPI endpoint.");
const provider = new OpenAICompatibleImageProvider();
const referenceSupported = provider.capabilities().referenceImages;
const db = getDatabase();
const originalFetch = globalThis.fetch;
let fullPrompt = "";
const diagnostics: Record<string, unknown> = { model, calls: 0, requestId: randomUUID(), referenceSupported, phase: "preflight", environment: { keyAvailable: Boolean(key), baseAvailable: Boolean(baseURL), modelAvailable: Boolean(model) } };
function safe(value: unknown) {
  if (typeof value !== "string") return undefined;
  let result = value.split(key!).join("[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\bsk[-_][A-Za-z0-9_-]+/g, "[redacted]");
  if (fullPrompt) result = result.split(fullPrompt).join("[prompt omitted]");
  return result.slice(0, 600);
}
try {
  const character = await db.character.findFirstOrThrow({ where: { id: characterId, status: "ACTIVE", deletedAt: null } });
  const member = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: character.workspaceId, role: "OWNER" } });
  Object.assign(diagnostics, { characterId: character.id, workspaceId: character.workspaceId });
  await mkdir("artifacts", { recursive: true });
  // Refuse to replace a previous attempt. No automatic paid retry.
  await writeFile(artifact, JSON.stringify(diagnostics, null, 2), { flag: "wx" });
  globalThis.fetch = async (input, init) => {
    if (Number(diagnostics.calls) !== 0) throw new Error("Exactly one provider request is allowed.");
    const endpoint = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(endpoint);
    assert.equal(url.origin, base.origin);
    assert.ok(url.pathname.endsWith("/images/generations") || (referenceSupported && url.pathname.endsWith("/images/edits")));
    if (!referenceSupported) assert.ok(url.pathname.endsWith("/images/generations"));
    const payload = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(String(init?.body));
    assert.equal(payload.model, model);
    assert.equal(Number(payload.n), 1);
    fullPrompt = String(payload.prompt);
    Object.assign(diagnostics, { calls: 1, endpoint: url.origin + url.pathname, requestedSize: payload.size, phase: "request_sent" });
    await writeFile(artifact, JSON.stringify(diagnostics, null, 2));
    const response = await originalFetch(input, init);
    diagnostics.httpStatus = response.status;
    if (response.ok) {
      const body = await response.clone().json().catch(() => undefined);
      diagnostics.b64JsonReceived = typeof body?.data?.[0]?.b64_json === "string" && body.data[0].b64_json.length > 0;
    }
    if (!response.ok) {
      const body = await response.clone().json().catch(() => undefined);
      diagnostics.providerError = { code: safe(body?.error?.code), type: safe(body?.error?.type), message: safe(body?.error?.message || body?.message || body?.detail) };
    }
    return response;
  };
  const storage = new LocalStorageProvider();
  const service = createMediaService(async () => ({ userId: member.userId, workspaceId: member.workspaceId }), provider, storage);
  const asset = await service.generate({ characterId, instruction: "Портрет по пояс, нейтральный светлый фон, мягкий студийный свет.", format: "PORTRAIT", aspectRatio: "1:1" }, String(diagnostics.requestId));
  const saved = await service.get(asset.id);
  assert.equal(saved.workspaceId, member.workspaceId); assert.equal(saved.characterId, character.id); assert.equal(saved.model, model);
  const bytes = await storage.read(saved.storageKey);
  const metadata = await inspectImage(bytes);
  assert.equal(metadata.fileSize, saved.fileSize);
  assert.equal(metadata.mimeType, saved.mimeType);
  assert.equal(metadata.width, saved.width); assert.equal(metadata.height, saved.height);
  const reopened = await service.read(saved.id);
  assert.deepEqual(reopened.bytes, bytes);
  if (!referenceSupported) assert.equal(saved.referenceUsed, false);
  Object.assign(diagnostics, { phase: "saved", mediaAssetId: saved.id, mimeType: metadata.mimeType, width: metadata.width, height: metadata.height, fileSize: metadata.fileSize, referenceUsed: saved.referenceUsed, storagePath: path.resolve(process.env.MEDIA_STORAGE_DIR?.trim() || "data/media", saved.storageKey), validated: true, ownershipVerified: true, storageReadVerified: true });
  await writeFile(artifact, JSON.stringify(diagnostics, null, 2));
  console.log(JSON.stringify(diagnostics));
} catch (error) {
  diagnostics.phase = "failed";
  diagnostics.failure = error instanceof ImageError ? error.code : error instanceof Error ? safe(error.message) : "UnknownError";
  diagnostics.safeMessage = error instanceof ImageError ? imageMessages[error.code] : diagnostics.failure;
  // If marker already existed, preserve it rather than erasing previous evidence.
  if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) await writeFile(artifact, JSON.stringify(diagnostics, null, 2)).catch(() => undefined);
  console.error(JSON.stringify(diagnostics));
  process.exitCode = 1;
} finally { globalThis.fetch = originalFetch; await db.$disconnect(); }
