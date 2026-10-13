import "server-only";
import { z } from "zod";
import { VideoError, type VideoInput, type VideoJob, type VideoProvider } from "./video-types";
import { maxVideoBytes } from "@/features/media/video-file";

export const motionModel = "fal-ai/kling-video/v3/pro/motion-control";
const jobId = z.string().regex(/^[a-zA-Z0-9_-]{1,240}$/);
// fal's queue operations use the application ID, without the model subpath.
const queueRoot = "https://queue.fal.run/fal-ai/kling-video";
export function falResultUrl(raw: unknown) {
  try {
    const url = new URL(z.url().parse(raw));
    if (url.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)?fal\.media$/.test(url.hostname) || url.port || url.username || url.password) throw new VideoError("response");
    return url.href;
  } catch { throw new VideoError("response"); }
}
export class FalMotionProvider implements VideoProvider {
  private key() { const key = process.env.FAL_KEY?.trim(); if (!key) throw new VideoError("configuration"); return key; }
  configuration() { this.key(); return { provider: "fal-motion", model: motionModel }; }
  async capabilities() { this.key(); return { referenceImages: true, durations: Array.from({ length: 28 }, (_, i) => i + 3), aspectRatios: ["9:16", "16:9", "1:1"] }; }
  private async request(url: string, body?: unknown) {
    try {
      const response = await fetch(url, { method: body ? "POST" : "GET", headers: { Authorization: `Key ${this.key()}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000), redirect: "error", cache: "no-store" });
      if (!response.ok) {
        await response.body?.cancel();
        throw new VideoError(response.status === 402 ? "balance" : [401, 403].includes(response.status) ? "configuration" : [400, 422].includes(response.status) ? "invalid" : response.status === 404 ? "missing" : response.status === 429 ? "rate_limit" : body ? "ambiguous" : "provider");
      }
      return response;
    } catch (error) { if (error instanceof VideoError) throw error; throw new VideoError(body ? "ambiguous" : "timeout"); }
  }
  async createVideo(input: VideoInput): Promise<VideoJob> {
    const source = input.performance;
    if (!source?.bytes.length || source.mimeType !== "video/mp4" || input.audio || input.duration < 3 || input.duration > (source.orientation === "image" ? 10 : 30)) throw new VideoError("invalid");
    const dataUrl = (file: { bytes: Buffer; mimeType: string }) => `data:${file.mimeType};base64,${file.bytes.toString("base64")}`;
    const response = await this.request(`https://queue.fal.run/${motionModel}`, { prompt: input.prompt, image_url: dataUrl(input.reference), video_url: dataUrl(source), character_orientation: source.orientation, keep_original_sound: source.keepOriginalSound });
    try { return { id: jobId.parse((await response.json()).request_id), status: "PENDING" }; }
    catch { throw new VideoError("ambiguous"); }
  }
  async getVideoStatus(id: string): Promise<VideoJob> {
    jobId.parse(id);
    const raw = await (await this.request(`${queueRoot}/requests/${encodeURIComponent(id)}/status`)).json();
    const parsed = z.object({ status: z.enum(["IN_QUEUE", "IN_PROGRESS", "COMPLETED"]), error: z.unknown().optional() }).safeParse(raw);
    if (!parsed.success) throw new VideoError("response");
    return { id, status: parsed.data.error ? "FAILED" : parsed.data.status === "COMPLETED" ? "READY" : parsed.data.status === "IN_QUEUE" ? "PENDING" : "PROCESSING", ...(parsed.data.error ? { error: "provider" as const } : {}) };
  }
  async downloadVideo(id: string) {
    jobId.parse(id);
    const raw = await (await this.request(`${queueRoot}/requests/${encodeURIComponent(id)}`)).json();
    if (raw.error) throw new VideoError("provider");
    const url = falResultUrl(raw.video?.url);
    // No credentials on CDN requests. No redirects or user-controlled download hosts.
    const response = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: "error", cache: "no-store" });
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxVideoBytes) { await response.body?.cancel(); throw new VideoError("response"); }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > maxVideoBytes) throw new VideoError("response"); chunks.push(part.value); }
      if (!size) throw new VideoError("response");
      return { bytes: Buffer.concat(chunks, size), mimeType: "video/mp4" };
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    finally { reader.releaseLock(); }
  }
}
