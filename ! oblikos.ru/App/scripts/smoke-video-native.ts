import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { getDatabase } from "../src/db/client";
import { ProxyAPIGoogleVeoProvider, googleVideoBaseURL, nativeVideoModel, NativeVideoHTTPError } from "../src/features/ai/google-veo-provider";
import { createVideoService } from "../src/features/media/video-operations";
import { LocalStorageProvider } from "../src/features/media/storage";
import { VideoError } from "../src/features/ai/video-types";

// Never rerun create after this artifact exists, including ambiguous/failed cases.
const artifact = process.env.VIDEO_SMOKE_ARTIFACT || "artifacts/veo-unified-live.json", requestId = randomUUID();
const db = getDatabase(), storage = new LocalStorageProvider(), provider = new ProxyAPIGoogleVeoProvider();
const diagnostics: Record<string, unknown> = { requestId, calls: 0, phase: "preflight", nativeBaseURL: googleVideoBaseURL };
const originalFetch = globalThis.fetch;
let createHTTP: number | undefined;
async function save() { await writeFile(artifact, JSON.stringify(diagnostics, null, 2)); }
try {
  const configuration = provider.configuration(), nativeModel = nativeVideoModel(configuration.model);
  Object.assign(diagnostics, { model: configuration.model, nativeModel, endpoint: `${googleVideoBaseURL}/v1beta/models/${nativeModel}:predictLongRunning` });
  // Durable one-attempt marker precedes any operation; never overwrite a previous run.
  await writeFile(artifact, JSON.stringify(diagnostics, null, 2), { flag: "wx" });
  const capabilities = await provider.capabilities();
  assert.ok(capabilities.durations.includes(4) && capabilities.aspectRatios.includes("16:9"));
  diagnostics.nativeModelConfirmed = true;
  const previousImageSmoke = "5e729717-f784-4297-8433-64e18beb01e6";
  const character = await db.character.findFirstOrThrow({ where: { id: previousImageSmoke, status: "ACTIVE", deletedAt: null } });
  const member = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: character.workspaceId, role: "OWNER" } });
  const primary = await db.mediaAsset.findFirstOrThrow({ where: { characterId: character.id, workspaceId: character.workspaceId, type: "IMAGE", isPrimaryReference: true, deletedAt: null } });
  assert.ok((await storage.read(primary.storageKey)).length);
  Object.assign(diagnostics, { characterId: character.id, workspaceId: character.workspaceId, primaryAtPreflight: primary.id, duration: 4, resolution: "720p", aspectRatio: "16:9", phase: "ready-to-submit" }); await save();
  globalThis.fetch = async (input, init) => {
    const url = String(input), method = init?.method || "GET";
    if (method === "POST") {
      assert.equal(url, diagnostics.endpoint);
      assert.equal(diagnostics.calls, 0, "No second provider create is allowed");
      const receipt = await db.mediaGeneration.findUniqueOrThrow({ where: { id: requestId } });
      const reference = await db.mediaAsset.findUniqueOrThrow({ where: { id: receipt.referenceAssetId! } });
      const bytes = await storage.read(reference.storageKey), payload = JSON.parse(String(init?.body));
      assert.equal(payload.instances[0].image.bytesBase64Encoded, bytes.toString("base64"));
      assert.equal(payload.instances[0].image.mimeType, reference.mimeType);
      assert.equal(payload.parameters.sampleCount, 1);
      Object.assign(diagnostics, { calls: 1, referenceAssetId: reference.id, imageBytesTransmitted: true, referenceMimeType: reference.mimeType, referenceByteLength: bytes.length, phase: "create-attempted" }); await save();
      const response = await originalFetch(input, init);
      createHTTP = response.status; diagnostics.createHTTPStatus = response.status; await save();
      return response;
    }
    return originalFetch(input, init);
  };
  const service = createVideoService(async () => ({ userId: member.userId, workspaceId: character.workspaceId }), provider, storage);
  let job = await service.create({ characterId: character.id, scene: "Персонаж из исходного изображения спокойно стоит у окна. Сохранить внешность и одежду исходного кадра.", motion: "Лёгкое естественное движение головы и моргание, неподвижная камера.", duration: 4, aspectRatio: "16:9" }, requestId);
  let receipt = await db.mediaGeneration.findUniqueOrThrow({ where: { id: requestId } });
  Object.assign(diagnostics, { providerJobId: receipt.providerJobId, status: job.status, errorCode: receipt.errorCode, createHTTPStatus: createHTTP, phase: job.status === "FAILED" ? "failed-create" : "processing" }); await save();
  console.log(JSON.stringify({ phase: diagnostics.phase, createHTTPStatus: createHTTP, status: job.status, providerJobId: receipt.providerJobId, calls: diagnostics.calls }));
  if (job.status === "FAILED" || !receipt.providerJobId) { process.exitCode = 1; }
  else {
    const deadline = Date.now() + 20 * 60 * 1000;
    while (job.status === "PROCESSING" && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 11000));
      job = await service.status(requestId);
      receipt = await db.mediaGeneration.findUniqueOrThrow({ where: { id: requestId } });
      Object.assign(diagnostics, { status: job.status, errorCode: receipt.errorCode, phase: job.status === "READY" ? "saved" : job.status === "FAILED" ? "failed-operation" : "processing" }); await save();
      console.log(JSON.stringify({ status: job.status, errorCode: receipt.errorCode }));
    }
    if (job.status === "READY") {
      const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: job.mediaId! } });
      assert.equal(asset.referenceAssetId, diagnostics.referenceAssetId); assert.equal(asset.type, "VIDEO");
      Object.assign(diagnostics, { mediaAssetId: asset.id, mimeType: asset.mimeType, fileSize: asset.fileSize, width: asset.width, height: asset.height, videoDuration: asset.duration, mp4Received: true, referenceSnapshotVerified: true }); await save();
    } else process.exitCode = 1;
  }
} catch (error) {
  // No provider messages/body, API key, prompt or image data in diagnostics.
  Object.assign(diagnostics, { phase: "failed", failureType: error instanceof VideoError ? error.code : error instanceof Error ? error.name : "Error", ...(error instanceof NativeVideoHTTPError ? { httpStatus: error.httpStatus } : {}) });
  // If wx failed, preserve the existing one-attempt marker instead of replacing it.
  if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) await save();
  console.error(JSON.stringify({ phase: "failed", failureType: diagnostics.failureType, httpStatus: diagnostics.httpStatus })); process.exitCode = 1;
} finally { globalThis.fetch = originalFetch; await db.$disconnect(); }
