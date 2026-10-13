import "dotenv/config";
import { getDatabase } from "../src/db/client";
import { AitunnelAvatarProvider } from "../src/features/ai/avatar-provider";
import { LocalStorageProvider } from "../src/features/media/storage";
import { inspectVideo } from "../src/features/media/video-file";
import { restoreOriginalVideoSound } from "../src/features/media/original-video-sound";
import { VideoError } from "../src/features/ai/video-types";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
const db = getDatabase(), storage = new LocalStorageProvider();
const id = "a0429cb7-6124-408f-b7eb-dfd31b519b0e";
let directory: string | undefined;
try {
  const g = await db.mediaGeneration.findUniqueOrThrow({ where: { id } });
  if (g.provider !== "aitunnel-motion" || g.model !== "hailuo-3" || !g.providerJobId || !g.sourceId) throw new Error("Unexpected receipt");
  const recovering = process.argv.includes("--recover");
  if (recovering && (g.status !== "FAILED" || g.errorCode !== "response" || g.mediaId || !g.creatorUserId || !g.referenceAssetId)) throw new Error("Receipt cannot be recovered");
  if ((await new AitunnelAvatarProvider().getVideoStatus(g.providerJobId)).status !== "READY") throw new Error("Provider result not ready");
  const file = await new AitunnelAvatarProvider().downloadVideo(g.providerJobId);
  const source = await db.videoSource.findUniqueOrThrow({ where: { id: g.sourceId } });
  console.log(JSON.stringify({ bytes: file.bytes.length, sourceDuration: source.duration, requestedDuration: g.duration, parameters: { keepOriginalSound: (g.parameters as { keepOriginalSound?: boolean }).keepOriginalSound } }));
  try { console.log(JSON.stringify({ inspected: inspectVideo(file.bytes, file.mimeType, 31, 2560 * 1440) })); }
  catch (error) { console.log(JSON.stringify({ inspectionError: error instanceof VideoError ? error.code : "unknown" })); }
  directory = await mkdtemp(path.join(tmpdir(), "oblikos-inspect-result-"));
  const input = path.join(directory, "input.mp4"); await writeFile(input, file.bytes, { mode: 0o600 });
  const decoded = await promisify(execFile)(ffmpeg!, ["-nostdin", "-hide_banner", "-i", input, "-t", "0.01", "-f", "null", "-"], { timeout: 30000, maxBuffer: 65536 });
  console.log(decoded.stderr.split("\n").filter(line => /Duration:|Stream.*Video:|Stream.*Audio:/.test(line)).join("\n"));
  const sourcePath = path.join(directory, "source.mp4"), mergedPath = path.join(directory, "merged.mp4");
  await writeFile(sourcePath, await storage.read(source.storageKey), { mode: 0o600 });
  await promisify(execFile)(ffmpeg!, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", input, "-i", sourcePath, "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "-1", "-map_chapters", "-1", "-c:v", "copy", "-c:a", "copy", "-t", source.duration.toFixed(6), "-movflags", "+faststart", mergedPath], { timeout: 45000, maxBuffer: 65536 });
  const mergedBytes = await readFile(mergedPath), metadata = inspectVideo(mergedBytes, "video/mp4", 16, 2560 * 1440);
  console.log(JSON.stringify({ rawMerge: metadata }));
  if (recovering) {
    if (source.workspaceId !== g.workspaceId || source.characterId !== g.characterId || source.userId !== g.creatorUserId || !source.hasAudio || Math.abs(metadata.duration - source.duration) > 0.25) throw new Error("Source/result mismatch");
    if (!await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: g.workspaceId, userId: g.creatorUserId! } } }) || !await db.character.findFirst({ where: { id: g.characterId, workspaceId: g.workspaceId, deletedAt: null } }) || !await db.mediaAsset.findFirst({ where: { id: g.referenceAssetId!, workspaceId: g.workspaceId, characterId: g.characterId, type: "IMAGE", deletedAt: null } })) throw new Error("Access changed");
    const storageKey = await storage.save({ workspaceId: g.workspaceId, characterId: g.characterId, extension: "mp4", bytes: mergedBytes });
    try {
      await db.$transaction(async tx => {
        const latest = await tx.mediaGeneration.findUniqueOrThrow({ where: { id } });
        if (latest.status !== "FAILED" || latest.errorCode !== "response" || latest.mediaId || latest.providerJobId !== g.providerJobId) throw new Error("Receipt changed");
        const asset = await tx.mediaAsset.create({ data: { workspaceId: g.workspaceId, characterId: g.characterId, type: "VIDEO", storageKey, mimeType: "video/mp4", width: metadata.width, height: metadata.height, duration: metadata.duration, fileSize: metadata.fileSize, prompt: g.prompt || "Повторить исполнение", provider: g.provider!, model: g.model!, referenceAssetId: g.referenceAssetId, referenceUsed: true } });
        await tx.mediaGeneration.update({ where: { id }, data: { status: "READY", mediaId: asset.id, errorCode: null, pollLeaseId: null, pollLeaseUntil: null } });
        console.log(JSON.stringify({ recoveredMediaId: asset.id, paidSubmissions: 0 }));
      });
    } catch (error) { if (!await db.mediaAsset.findUnique({ where: { storageKey } })) await storage.delete(storageKey); throw error; }
  }
  if (!recovering) {
    try { const merged = await restoreOriginalVideoSound(file.bytes, await storage.read(source.storageKey), source.duration); console.log(JSON.stringify({ merged: inspectVideo(merged, "video/mp4", 31, 2560 * 1440) })); }
    catch (error) { console.log(JSON.stringify({ mergeError: error instanceof VideoError ? error.code : "unknown" })); }
  }
} finally { if (directory) await rm(directory, { recursive: true, force: true }); await db.$disconnect(); }
