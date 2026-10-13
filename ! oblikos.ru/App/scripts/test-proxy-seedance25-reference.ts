// Authorized 5-second Seedance 2.5 480p test, estimated 87.38 RUB; --submit requires user approval. Re-running never
// repeats a POST: its durable receipt is committed before contacting AITUNNEL.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import { getDatabase } from "../src/db/client";
import { AitunnelAvatarProvider } from "../src/features/ai/avatar-provider";
import { VideoError } from "../src/features/ai/video-types";
import { videoDiagnostic } from "../src/features/ai/video-diagnostic";
import { reserveGeneration, GenerationSafetyError } from "../src/features/ai/safety";
import { assertVideoAccess } from "../src/features/media/source-operations";
import { LocalStorageProvider } from "../src/features/media/storage";
import { videoInputUrls } from "../src/features/media/signed-video-input";
import { inspectVideo } from "../src/features/media/video-file";
import { restoreOriginalVideoSound } from "../src/features/media/original-video-sound";

const id = "e727ab35-2539-471f-8c12-6e91ec911cd8";
const transportId = "167d17d2-4192-42da-99e6-730807a88fe6";
const previousId = "ef15cbbe-cc8b-4545-9cbf-7520e6fc769a";
const db = getDatabase(), storage = new LocalStorageProvider(), execute = promisify(execFile);
class ProxySeedance25Test extends AitunnelAvatarProvider {
  protected override key() {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new VideoError("configuration");
    return key;
  }
  protected override async request(route: string, body?: unknown) {
    try {
      const response = await fetch(`https://api.proxyapi.ru/v1/${route}`, {
        method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${this.key()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000), redirect: "error", cache: "no-store",
      });
      if (!response.ok) throw new VideoError(response.status === 402 ? "balance" : response.status === 400 ? "invalid" : body ? "ambiguous" : "provider", await videoDiagnostic(response, body, this.key()));
      return response;
    } catch (error) { if (error instanceof VideoError) throw error; throw new VideoError(body ? "ambiguous" : "timeout"); }
  }
  protected override downloadLimits = { duration: 16, pixels: 2560 * 1440 };
  override configuration() { this.key(); return { provider: "proxyapi", model: "bytedance/seedance-2.5" }; }
  async submit(prompt: string, urls: { image: string; video: string }) {
    const response = await this.request("videos", { model: "bytedance/seedance-2.5", prompt, duration: 5, size: "480x854", generate_audio: true, input_references: [{ type: "video_url", video_url: { url: urls.video } }, { type: "image_url", image_url: { url: urls.image } }] });
    return this.job(await response.json());
  }
  async inspect(id: string) {
    const raw = await (await this.request(`videos/${encodeURIComponent(id)}`)).json();
    return { job: this.job(raw), cost: raw.usage?.cost_rub, diagnostic: raw.error ? await videoDiagnostic(Response.json({ error: raw.error }, { status: 400 }), {}, this.key()) : undefined };
  }
}
const provider = new ProxySeedance25Test();
let directory: string | undefined;
let paidRequestSent = false;
try {
  let g = await db.mediaGeneration.findUnique({ where: { id } });
  if (process.argv.includes("--export-reference")) {
    if (!g?.referenceAssetId) throw new Error("Missing reference");
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: g.referenceAssetId } });
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/proxy-seedance25-kittens-reference.png", await storage.read(asset.storageKey), { mode: 0o600 });
    console.log(JSON.stringify({ exported: "artifacts/proxy-seedance25-kittens-reference.png", referenceAssetId: asset.id }));
  } else if (process.argv.includes("--export")) {
    if (g?.status !== "READY" || !g.mediaId) throw new Error("Result not ready");
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: g.mediaId } });
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/proxy-seedance25-kittens-20261013.mp4", await storage.read(asset.storageKey), { mode: 0o600 });
    console.log(JSON.stringify({ exported: "artifacts/proxy-seedance25-kittens-20261013.mp4", mediaId: asset.id, width: asset.width, height: asset.height, duration: asset.duration }));
  } else if (process.argv.includes("--receipt")) {
    console.log(JSON.stringify(g ? { id, status: g.status, error: g.errorCode, mediaId: g.mediaId, pollAttempts: g.pollAttempts, nextPollAt: g.nextPollAt } : { id, status: "MISSING" }));
    if (g?.mediaId) {
      const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: g.mediaId } });
      const remote = g.providerJobId ? await provider.inspect(g.providerJobId) : undefined;
      console.log(JSON.stringify({ duration: asset.duration, width: asset.width, height: asset.height, actualCostRub: remote?.cost }));
    }
  } else if (process.argv.includes("--handoff")) {
    const result = await db.mediaGeneration.updateMany({ where: { id, status: "PROCESSING", providerJobId: { not: null } }, data: { pollLeaseId: null, pollLeaseUntil: null, nextPollAt: null } });
    console.log(JSON.stringify({ id, workerHandoff: result.count === 1 }));
    process.exitCode = result.count === 1 ? 0 : 1;
  } else {
  if (!g && process.argv.includes("--submit")) {
    const previous = await db.mediaGeneration.findUniqueOrThrow({ where: { id: previousId } });
    if (!previous.creatorUserId || !previous.sourceId || !previous.referenceAssetId) throw new Error("Missing reference");
    const context = { userId: previous.creatorUserId, workspaceId: previous.workspaceId };
    await assertVideoAccess(context, previous.characterId, true);
    const image = await db.mediaAsset.findFirstOrThrow({ where: { id: previous.referenceAssetId, workspaceId: context.workspaceId, characterId: previous.characterId, type: "IMAGE", deletedAt: null } });
    await storage.read(image.storageKey);
    const source = await db.videoSource.findFirstOrThrow({ where: { id: previous.sourceId, userId: context.userId, workspaceId: context.workspaceId, characterId: previous.characterId, kind: "VIDEO", expiresAt: { gt: new Date() } } });
    directory = await mkdtemp(path.join(tmpdir(), "oblikos-seedance25-test-"));
    const input = path.join(directory, "input.mp4"), output = path.join(directory, "clip.mp4");
    await writeFile(input, await storage.read(source.storageKey), { mode: 0o600 });
    await execute(ffmpeg!, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", input, "-t", "5", "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output], { timeout: 60000 });
    const bytes = await readFile(output), metadata = inspectVideo(bytes, "video/mp4", 5.1, 1920 * 1080);
    const sourceKey = await storage.save({ workspaceId: context.workspaceId, characterId: previous.characterId, extension: "mp4", bytes });
    const clip = await db.videoSource.create({ data: { ...context, characterId: previous.characterId, kind: "VIDEO", storageKey: sourceKey, mimeType: "video/mp4", duration: metadata.duration, fileSize: bytes.length, hasAudio: source.hasAudio, expiresAt: new Date(Date.now() + 86400000) } });
    const prompt = "Replace the three people in the source video with the three kittens from the reference image. Left kitten replaces left person, center kitten replaces center person, right kitten replaces right person. Keep each kitten's fur and face. Preserve the original choreography, timing, composition, background and camera. Animate paws and bodies naturally. Only three kittens, no people or extra limbs.";
    g = await db.mediaGeneration.create({ data: { id, ...{ workspaceId: context.workspaceId, characterId: previous.characterId, creatorUserId: context.userId }, type: "VIDEO", mode: "PERFORMANCE", status: "PENDING", fingerprint: "proxy-seedance25-five-second-approved-test", provider: "proxyapi", model: "bytedance/seedance-2.5", sourceId: clip.id, referenceAssetId: image.id, prompt, scene: "Тест ProxyAPI Seedance 2.5 · 480p · котята · 5 секунд", duration: 5, aspectRatio: "9:16", quotedCost: 87.3803, costCurrency: "RUB", parameters: { keepOriginalSound: false, test: true, size: "480x854", resolution: "480p" }, submissionStartedAt: new Date(), pollLeaseId: randomUUID(), pollLeaseUntil: new Date(Date.now() + 10800000) } });
    try {
      await reserveGeneration("video", context);
      // Existing protected input route is limited to aitunnel-motion records.
      // This transport-only PROCESSING row has no providerJobId and cannot be
      // submitted by the worker. The actual paid generation stays proxyapi.
      await db.mediaGeneration.create({ data: {
        id: transportId, workspaceId: context.workspaceId, characterId: previous.characterId, creatorUserId: context.userId,
        type: "VIDEO", mode: "PERFORMANCE", status: "PROCESSING", fingerprint: "proxy-seedance25-private-input-transport",
        provider: "aitunnel-motion", model: "seedance-2.0-mini", sourceId: clip.id, referenceAssetId: image.id,
        duration: 5, aspectRatio: "9:16", parameters: { transportOnly: true, actualGenerationId: id },
        submissionStartedAt: new Date(), pollLeaseId: randomUUID(), pollLeaseUntil: new Date(Date.now() + 86400000),
      } });
      const urls = videoInputUrls(transportId); if (!urls) throw new Error("Production signed inputs required");
      for (const url of Object.values(urls)) { const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) }); if (response.status !== 200) throw new Error("Input unavailable"); }
      paidRequestSent = true;
      const remote = await provider.submit(prompt, urls);
      g = await db.mediaGeneration.update({ where: { id }, data: { providerJobId: remote.id, status: remote.status === "FAILED" ? "FAILED" : "PROCESSING", errorCode: remote.status === "FAILED" ? "provider" : null } });
    } catch (error) {
      await db.mediaGeneration.updateMany({ where: { id, providerJobId: null }, data: { status: "FAILED", errorCode: error instanceof VideoError || error instanceof GenerationSafetyError ? error.code : "ambiguous" } });
      await db.mediaGeneration.updateMany({ where: { id: transportId }, data: { status: "FAILED", errorCode: "source", pollLeaseId: null, pollLeaseUntil: null } });
      if (error instanceof VideoError) console.log(JSON.stringify({ status: "FAILED", error: error.code, diagnostic: error.diagnostic }));
      else if (error instanceof GenerationSafetyError) console.log(JSON.stringify({ status: "FAILED", error: error.code, paidRequestSent: false }));
      else console.log(JSON.stringify({ stopped: true, paidRequestSent, reason: error instanceof Error && ["Input unavailable", "Production signed inputs required"].includes(error.message) ? error.message : "unexpected", noAutomaticRetry: true }));
      process.exitCode = 1;
    }
  }
  g = await db.mediaGeneration.findUnique({ where: { id } });
  if (!g) throw new Error("No receipt: use --submit for the approved test");
  if (g.status === "PROCESSING" && g.providerJobId) {
    const remote = await provider.inspect(g.providerJobId);
    console.log(JSON.stringify({ id, providerJobId: g.providerJobId, status: remote.job.status, actualCostRub: remote.cost, diagnostic: remote.diagnostic }));
    if (remote.job.status === "FAILED") {
      await db.mediaGeneration.update({ where: { id }, data: { status: "FAILED", errorCode: "provider", pollLeaseId: null, pollLeaseUntil: null } });
      await db.mediaGeneration.updateMany({ where: { id: transportId }, data: { status: "FAILED", errorCode: "source", pollLeaseId: null, pollLeaseUntil: null } });
    }
    if (remote.job.status === "READY") {
      const file = await provider.downloadVideo(g.providerJobId);
      const source = await db.videoSource.findUniqueOrThrow({ where: { id: g.sourceId! } });
      if (source.hasAudio) file.bytes = await restoreOriginalVideoSound(file.bytes, await storage.read(source.storageKey), source.duration);
      const metadata = inspectVideo(file.bytes, file.mimeType, 16, 2560 * 1440);
      const key = await storage.save({ workspaceId: g.workspaceId, characterId: g.characterId, extension: "mp4", bytes: file.bytes });
      await db.$transaction(async tx => {
        const latest = await tx.mediaGeneration.findUniqueOrThrow({ where: { id } }); if (latest.status !== "PROCESSING") return;
        const asset = await tx.mediaAsset.create({ data: { workspaceId: g!.workspaceId, characterId: g!.characterId, type: "VIDEO", storageKey: key, mimeType: "video/mp4", width: metadata.width, height: metadata.height, duration: metadata.duration, fileSize: file.bytes.length, prompt: g!.prompt!, provider: "proxyapi", model: "bytedance/seedance-2.5", referenceAssetId: g!.referenceAssetId, referenceUsed: true } });
        await tx.mediaGeneration.update({ where: { id }, data: { status: "READY", mediaId: asset.id, errorCode: null, pollLeaseId: null, pollLeaseUntil: null } });
        await tx.mediaGeneration.updateMany({ where: { id: transportId }, data: { status: "FAILED", errorCode: "source", pollLeaseId: null, pollLeaseUntil: null } });
        console.log(JSON.stringify({ savedMediaId: asset.id, duration: metadata.duration }));
      });
    }
  } else console.log(JSON.stringify({ id, status: g.status, error: g.errorCode, mediaId: g.mediaId }));
  }
} finally { if (directory) await rm(directory, { recursive: true, force: true }); await db.$disconnect(); }





