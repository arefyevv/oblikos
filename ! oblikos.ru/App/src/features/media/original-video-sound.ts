import "server-only";
import ffmpeg from "ffmpeg-static";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseBuffer } from "music-metadata";
import { VideoError } from "@/features/ai/video-types";
import { inspectVideo, maxVideoBytes } from "./video-file";

const execute = promisify(execFile);
export function originalSoundAvailable() { return Boolean(ffmpeg && existsSync(ffmpeg)); }

// Both inputs are already inspected private MP4s, never user-supplied URLs or
// command arguments. Stream copy retains the source audio and video timestamps;
// the integer generation duration is trimmed to the actual source duration.
export async function restoreOriginalVideoSound(video: Buffer, source: Buffer, duration: number) {
  if (!originalSoundAvailable()) throw new VideoError("configuration");
  if (!Number.isFinite(duration) || duration < 3 || duration > 30) throw new VideoError("invalid");
  const generated = inspectVideo(video, "video/mp4", 31, 2560 * 1440);
  inspectVideo(source, "video/mp4", 30, 1920 * 1080);
  if (generated.duration < duration - 0.12 || !(await parseBuffer(source, { mimeType: "video/mp4" })).format.hasAudio) throw new VideoError("response");
  const directory = await mkdtemp(path.join(tmpdir(), "oblikos-sound-"));
  try {
    const output = path.join(directory, "result.mp4");
    await Promise.all([writeFile(path.join(directory, "generated.mp4"), video, { mode: 0o600 }), writeFile(path.join(directory, "source.mp4"), source, { mode: 0o600 })]);
    await execute(ffmpeg!, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y",
      "-protocol_whitelist", "file,pipe", "-i", path.join(directory, "generated.mp4"),
      "-protocol_whitelist", "file,pipe", "-i", path.join(directory, "source.mp4"),
      "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "-1", "-map_chapters", "-1",
      "-c:v", "copy", "-c:a", "copy", "-t", duration.toFixed(6), "-fs", String(maxVideoBytes), "-movflags", "+faststart", output,
    ], { timeout: 45000, maxBuffer: 64 * 1024, windowsHide: true });
    const bytes = await readFile(output), metadata = inspectVideo(bytes, "video/mp4", 31, 2560 * 1440);
    // Stream-copying H.264 with reordered B-frames can extend the MP4 movie
    // duration by a few frames (observed: 14.234s source -> 14.375s container).
    // Keep the original audio samples; allow at most 250ms of container drift.
    if (Math.abs(metadata.duration - duration) > 0.25 || !(await parseBuffer(bytes, { mimeType: "video/mp4" })).format.hasAudio) throw new VideoError("audio_merge");
    return bytes;
  } catch (error) {
    if (error instanceof VideoError) throw error;
    throw new VideoError("audio_merge");
  } finally { await rm(directory, { recursive: true, force: true }); }
}
