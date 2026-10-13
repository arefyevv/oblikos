// One explicitly approved 2-second test, capped at 95.20 RUB. Re-running never
// repeats a POST: its durable receipt is committed before contacting AITUNNEL.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import { getDatabase } from "../src/db/client";
import { AitunnelAvatarProvider } from "../src/features/ai/avatar-provider";
import { VideoError } from "../src/features/ai/video-types";
import { videoDiagnostic } from "../src/features/ai/video-diagnostic";
import { reserveGeneration } from "../src/features/ai/safety";
import { assertVideoAccess } from "../src/features/media/source-operations";
import { LocalStorageProvider } from "../src/features/media/storage";
import { videoInputUrls } from "../src/features/media/signed-video-input";
import { inspectVideo } from "../src/features/media/video-file";

const id = "8f0c9b52-b00a-40a8-9809-c27fb40e2419";
const previousId = "24bbd69c-6b32-42e5-9e1f-1d3688b69b75";
const db = getDatabase(), storage = new LocalStorageProvider(), execute = promisify(execFile);
class AlephTest extends AitunnelAvatarProvider {
  override configuration() { this.key(); return { provider: "aitunnel-motion", model: "aleph-2" }; }
  async submit(prompt: string, urls: { image: string; video: string }) {
    const response = await this.request("videos", { model: "aleph-2", prompt, duration: 2, aspect_ratio: "9:16", input_references: [{ type: "video_url", video_url: { url: urls.video } }, { type: "image_url", image_url: { url: urls.image } }] });
    return this.job(await response.json());
  }
  async inspect(id: string) {
    const raw = await (await this.request(`videos/${encodeURIComponent(id)}`)).json();
    return { job: this.job(raw), cost: raw.usage?.cost_rub, diagnostic: raw.error ? await videoDiagnostic(Response.json({ error: raw.error }, { status: 400 }), {}, this.key()) : undefined };
  }
}
const provider = new AlephTest();
let directory: string | undefined;
try {
  let g = await db.mediaGeneration.findUnique({ where: { id } });
  if (!g && process.argv.includes("--submit")) {
    const previous = await db.mediaGeneration.findUniqueOrThrow({ where: { id: previousId } });
    if (!previous.creatorUserId || !previous.sourceId || !previous.referenceAssetId) throw new Error("Missing reference");
    const context = { userId: previous.creatorUserId, workspaceId: previous.workspaceId };
    await assertVideoAccess(context, previous.characterId, true);
    const image = await db.mediaAsset.findFirstOrThrow({ where: { id: previous.referenceAssetId, workspaceId: context.workspaceId, characterId: previous.characterId, type: "IMAGE", deletedAt: null } });
    await storage.read(image.storageKey);
    const source = await db.videoSource.findFirstOrThrow({ where: { id: previous.sourceId, userId: context.userId, workspaceId: context.workspaceId, characterId: previous.characterId, kind: "VIDEO", expiresAt: { gt: new Date() } } });
    const catalog = await (await fetch("https://api.aitunnel.ru/public/aitunnel/models/videos", { signal: AbortSignal.timeout(20000) })).json();
    const model = catalog["aleph-2"];
    if (model.max_price_per_second !== 47.6 || !model.supported_durations.includes(2) || !model.modalities.input.includes("video") || !model.modalities.input.includes("image")) throw new Error("Catalog differs from approved test");
    directory = await mkdtemp(path.join(tmpdir(), "oblikos-aleph-test-"));
    const input = path.join(directory, "input.mp4"), output = path.join(directory, "clip.mp4");
    await writeFile(input, await storage.read(source.storageKey), { mode: 0o600 });
    await execute(ffmpeg!, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", input, "-t", "2", "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output], { timeout: 60000 });
    const bytes = await readFile(output), metadata = inspectVideo(bytes, "video/mp4", 2.1, 1920 * 1080);
    const sourceKey = await storage.save({ workspaceId: context.workspaceId, characterId: previous.characterId, extension: "mp4", bytes });
    const clip = await db.videoSource.create({ data: { ...context, characterId: previous.characterId, kind: "VIDEO", storageKey: sourceKey, mimeType: "video/mp4", duration: metadata.duration, fileSize: bytes.length, hasAudio: source.hasAudio, expiresAt: new Date(Date.now() + 86400000) } });
    const prompt = "Replace the three people in the source video with the three kittens from the reference image. Left kitten replaces left person, center kitten replaces center person, right kitten replaces right person. Keep each kitten's fur and face. Preserve the original choreography, timing, composition, background and camera. Animate paws and bodies naturally. Only three kittens, no people or extra limbs.";
    g = await db.mediaGeneration.create({ data: { id, ...{ workspaceId: context.workspaceId, characterId: previous.characterId, creatorUserId: context.userId }, type: "VIDEO", mode: "PERFORMANCE", status: "PENDING", fingerprint: "aleph-two-second-approved-test", provider: "aitunnel-motion", model: "aleph-2", sourceId: clip.id, referenceAssetId: image.id, prompt, scene: "Тест Aleph 2 · котята · 2 секунды", duration: 2, aspectRatio: "9:16", quotedCost: 95.2, costCurrency: "RUB", parameters: { keepOriginalSound: false, test: true }, submissionStartedAt: new Date(), pollLeaseId: randomUUID(), pollLeaseUntil: new Date(Date.now() + 10800000) } });
    try {
      await reserveGeneration("video", context);
      const urls = videoInputUrls(id); if (!urls) throw new Error("Production signed inputs required");
      for (const url of Object.values(urls)) { const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) }); if (response.status !== 200) throw new Error("Input unavailable"); }
      const remote = await provider.submit(prompt, urls);
      g = await db.mediaGeneration.update({ where: { id }, data: { providerJobId: remote.id, status: remote.status === "FAILED" ? "FAILED" : "PROCESSING", errorCode: remote.status === "FAILED" ? "provider" : null } });
    } catch (error) {
      await db.mediaGeneration.updateMany({ where: { id, providerJobId: null }, data: { status: "FAILED", errorCode: error instanceof VideoError ? error.code : "ambiguous" } });
      if (error instanceof VideoError) console.log(JSON.stringify({ status: "FAILED", error: error.code, diagnostic: error.diagnostic }));
      else console.log("Test stopped; no automatic retry.");
      process.exitCode = 1;
    }
  }
  g = await db.mediaGeneration.findUnique({ where: { id } });
  if (!g) throw new Error("No receipt: use --submit for the approved test");
  if (g.status === "PROCESSING" && g.providerJobId) {
    const remote = await provider.inspect(g.providerJobId);
    console.log(JSON.stringify({ id, providerJobId: g.providerJobId, status: remote.job.status, actualCostRub: remote.cost, diagnostic: remote.diagnostic }));
    if (remote.job.status === "FAILED") await db.mediaGeneration.update({ where: { id }, data: { status: "FAILED", errorCode: "provider", pollLeaseId: null, pollLeaseUntil: null } });
    if (remote.job.status === "READY") {
      const file = await provider.downloadVideo(g.providerJobId);
      const metadata = inspectVideo(file.bytes, file.mimeType, 10.5, 2560 * 1440);
      const key = await storage.save({ workspaceId: g.workspaceId, characterId: g.characterId, extension: "mp4", bytes: file.bytes });
      await db.$transaction(async tx => {
        const latest = await tx.mediaGeneration.findUniqueOrThrow({ where: { id } }); if (latest.status !== "PROCESSING") return;
        const asset = await tx.mediaAsset.create({ data: { workspaceId: g!.workspaceId, characterId: g!.characterId, type: "VIDEO", storageKey: key, mimeType: "video/mp4", width: metadata.width, height: metadata.height, duration: metadata.duration, fileSize: file.bytes.length, prompt: g!.prompt!, provider: "aitunnel-motion", model: "aleph-2", referenceAssetId: g!.referenceAssetId, referenceUsed: true } });
        await tx.mediaGeneration.update({ where: { id }, data: { status: "READY", mediaId: asset.id, errorCode: null, pollLeaseId: null, pollLeaseUntil: null } });
        console.log(JSON.stringify({ savedMediaId: asset.id, duration: metadata.duration }));
      });
    }
  } else console.log(JSON.stringify({ id, status: g.status, error: g.errorCode, mediaId: g.mediaId }));
} finally { if (directory) await rm(directory, { recursive: true, force: true }); await db.$disconnect(); }
