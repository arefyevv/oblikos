import "server-only";
import { parseBuffer } from "music-metadata";
import { VideoError } from "@/features/ai/video-types";
import { inspectVideo } from "./video-file";
export const sourceMaxBytes = 30 * 1024 * 1024;
export async function inspectSource(bytes: Buffer, kind: "AUDIO" | "VIDEO") {
  if (!bytes.length || bytes.length > (kind === "AUDIO" ? 10 * 1024 * 1024 : sourceMaxBytes)) throw new VideoError("invalid");
  if (kind === "VIDEO") {
    const video = inspectVideo(bytes, "video/mp4", 30, 1920 * 1080);
    if (video.duration < 3 || Math.max(video.width, video.height) > 1920 || Math.min(video.width, video.height) > 1080) throw new VideoError("invalid");
    const metadata = await parseBuffer(bytes, { mimeType: "video/mp4" }, { duration: true, skipCovers: true });
    if (!metadata.format.hasVideo || !metadata.format.duration || Math.abs(metadata.format.duration - video.duration) > 0.5) throw new VideoError("invalid");
    return { ...video, hasAudio: metadata.format.hasAudio === true };
  }
  const wav = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE";
  const mp3 = bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (!wav && !mp3) throw new VideoError("invalid");
  const mimeType = wav ? "audio/wav" : "audio/mpeg";
  const metadata = await parseBuffer(bytes, { mimeType }, { duration: true, skipCovers: true });
  const duration = metadata.format.duration;
  if (!duration || !Number.isFinite(duration) || duration > 60 || !metadata.format.sampleRate || !metadata.format.numberOfChannels || metadata.format.numberOfChannels > 2 || !metadata.format.codec) throw new VideoError("invalid");
  if (wav && metadata.format.codec !== "PCM") throw new VideoError("invalid");
  if (!wav && !/MPEG.*[Ll]ayer\s*(3|III)/.test(metadata.format.codec)) throw new VideoError("invalid");
  return { extension: wav ? "wav" : "mp3", mimeType, duration, fileSize: bytes.length, hasAudio: true };
}
