import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { getDatabase } from "../src/db/client";
import { ProxyAPIVideoProvider } from "../src/features/ai/video-provider";
import { createVideoService } from "../src/features/media/video-operations";
import { LocalStorageProvider } from "../src/features/media/storage";
import { VideoError } from "../src/features/ai/video-types";

// Experimental wire verification precedes enabling this encoder in the app.
// Durable marker and transport guard permit exactly one paid POST per run.
const artifact = "artifacts/kling-live-20261006.json";
const requestId = randomUUID(), db = getDatabase(), storage = new LocalStorageProvider();
process.env.OPENAI_VIDEO_MODEL = "kwaivgi/kling-v3.0-pro";
const provider = new ProxyAPIVideoProvider(reference => ({ frame_images: [{
  type: "image_url", frame_type: "first_frame",
  image_url: { url: `data:${reference.mimeType};base64,${reference.bytes.toString("base64")}` },
}] }));
const diagnostics: Record<string, unknown> = { requestId, model: process.env.OPENAI_VIDEO_MODEL, calls: 0, phase: "preflight" };
const originalFetch = globalThis.fetch;
let markerCreated = false;
async function save() { await writeFile(artifact, JSON.stringify(diagnostics, null, 2)); }
try {
  await writeFile(artifact, JSON.stringify(diagnostics), { flag: "wx" }); markerCreated = true;
  const character = await db.character.findFirstOrThrow({ where: { id: "5e729717-f784-4297-8433-64e18beb01e6", status: "ACTIVE", deletedAt: null } });
  const member = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: character.workspaceId, role: "OWNER" } });
  const primary = await db.mediaAsset.findFirstOrThrow({ where: { characterId: character.id, workspaceId: character.workspaceId, type: "IMAGE", isPrimaryReference: true, deletedAt: null } });
  const referenceBytes = await storage.read(primary.storageKey);
  Object.assign(diagnostics, { characterId: character.id, primaryId: primary.id, duration: 4, aspectRatio: "16:9", resolution: "720p" });
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") {
      assert.equal(diagnostics.calls, 0); assert.equal(String(input), "https://api.proxyapi.ru/v1/videos");
      const body = JSON.parse(String(init.body));
      assert.equal(body.model, "kwaivgi/kling-v3.0-pro");
      assert.equal(body.frame_images[0].image_url.url, `data:${primary.mimeType};base64,${referenceBytes.toString("base64")}`);
      assert.equal(body.frame_images[0].frame_type, "first_frame");
      Object.assign(diagnostics, { calls: 1, referenceTransmitted: true, phase: "create" }); await save();
      const response = await originalFetch(input, init);
      diagnostics.createHTTP = response.status; await save();
      return response;
    }
    return originalFetch(input, init);
  };
  const service = createVideoService(async () => ({ userId: member.userId, workspaceId: character.workspaceId }), provider, storage);
  let job = await service.create({ characterId: character.id, scene: "Keep the person, face, hairstyle, clothing and background from the supplied portrait. Static close-up portrait, natural daylight.", motion: "The person gently turns their head toward the camera, blinks and smiles slightly. No scene changes.", duration: 4, aspectRatio: "16:9" }, requestId);
  const deadline = Date.now() + 15 * 60 * 1000;
  do {
    const receipt = await db.mediaGeneration.findUniqueOrThrow({ where: { id: requestId } });
    Object.assign(diagnostics, { status: job.status, errorCode: receipt.errorCode, providerJobId: receipt.providerJobId, mediaId: job.mediaId }); await save();
    console.log(JSON.stringify({ status: job.status, createHTTP: diagnostics.createHTTP, errorCode: receipt.errorCode, calls: diagnostics.calls }));
    if (["READY", "FAILED"].includes(job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 11000)); job = await service.status(requestId);
  } while (Date.now() < deadline);
  if (job.status === "READY") {
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: job.mediaId! } });
    assert.equal(asset.referenceAssetId, primary.id); assert.equal(asset.type, "VIDEO");
    const bytes = await storage.read(asset.storageKey);
    const videoPath = "artifacts/kling-live-20261006.mp4";
    await writeFile(videoPath, bytes);
    Object.assign(diagnostics, { phase: "saved", fileSize: bytes.length, videoPath, referenceSnapshotVerified: true }); await save();
  } else process.exitCode = 1;
} catch (error) {
  Object.assign(diagnostics, { phase: "failed", errorType: error instanceof VideoError ? error.code : error instanceof Error ? error.name : "Error" });
  if (markerCreated) await save();
  console.error(JSON.stringify({ phase: diagnostics.phase, errorType: diagnostics.errorType })); process.exitCode = 1;
} finally { globalThis.fetch = originalFetch; await db.$disconnect(); }
