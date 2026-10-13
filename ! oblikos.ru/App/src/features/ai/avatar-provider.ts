import "server-only";
import { z } from "zod";
import { VideoError, type VideoInput, type VideoJob, type VideoProvider } from "./video-types";
import { inspectVideo, maxVideoBytes } from "@/features/media/video-file";
import { videoDiagnostic } from "./video-diagnostic";

const jobSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,240}$/), status: z.enum(["pending", "queued", "in_progress", "processing", "completed", "failed", "expired", "cancelled"]) });
export class AitunnelAvatarProvider implements VideoProvider {
  protected key() { const key = process.env.AITUNNEL_API_KEY?.trim(); if (!key) throw new VideoError("configuration"); return key; }
  protected downloadLimits = { duration: 61, pixels: 1280 * 1280 };
  configuration() { this.key(); return { provider: "aitunnel-avatar", model: "avatar-iv" }; }
  async capabilities() { this.key(); return { referenceImages: true, durations: [5, 10, 15, 20, 30, 45, 60], aspectRatios: ["9:16", "16:9", "1:1"] }; }
  protected async request(path: string, body?: unknown) {
    try {
      const response = await fetch(`https://api.aitunnel.ru/v1/${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${this.key()}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000), redirect: "error", cache: "no-store" });
      if (!response.ok) {
        const diagnostic = await videoDiagnostic(response, body, this.key());
        throw new VideoError(response.status === 402 ? "balance" : [401, 403].includes(response.status) ? "configuration" : response.status === 400 ? "invalid" : response.status === 404 ? "missing" : response.status === 429 ? "rate_limit" : body ? "ambiguous" : "provider", diagnostic);
      }
      return response;
    } catch (error) { if (error instanceof VideoError) throw error; throw new VideoError(body ? "ambiguous" : "timeout"); }
  }
  protected job(raw: unknown): VideoJob {
    const parsed = jobSchema.safeParse(raw); if (!parsed.success) throw new VideoError("response");
    const { id, status } = parsed.data;
    return { id, status: status === "completed" ? "READY" : ["failed", "cancelled", "expired"].includes(status) ? "FAILED" : status === "pending" || status === "queued" ? "PENDING" : "PROCESSING", ...(["failed", "cancelled", "expired"].includes(status) ? { error: "provider" as const } : {}) };
  }
  async createVideo(input: VideoInput) {
    const capabilities = await this.capabilities();
    if (!input.audio?.bytes.length || !["audio/wav", "audio/mpeg"].includes(input.audio.mimeType) || !capabilities.durations.includes(input.duration) || !capabilities.aspectRatios.includes(input.aspectRatio)) throw new VideoError("invalid");
    const response = await this.request("videos", { model: "avatar-iv", prompt: input.prompt, resolution: "720p", duration: input.duration, aspect_ratio: input.aspectRatio,
      input_references: [
        { type: "image_url", image_url: { url: `data:${input.reference.mimeType};base64,${input.reference.bytes.toString("base64")}` } },
        { type: "audio_url", audio_url: { url: `data:${input.audio.mimeType};base64,${input.audio.bytes.toString("base64")}` } },
      ],
    });
    try { return this.job(await response.json()); } catch { throw new VideoError("ambiguous"); }
  }
  async getVideoStatus(id: string) { return this.job(await (await this.request(`videos/${encodeURIComponent(id)}`)).json()); }
  async downloadVideo(id: string) {
    // Fixed same-origin endpoint: never forward credentials to unsigned_urls or polling_url.
    const response = await this.request(`videos/${encodeURIComponent(id)}/content?index=0`);
    const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const genericBinary = ["application/octet-stream", "binary/octet-stream"].includes(mimeType);
    if ((mimeType !== "video/mp4" && !genericBinary) || Number(response.headers.get("content-length")) > maxVideoBytes || !response.body) { await response.body?.cancel(); throw new VideoError("response"); }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > maxVideoBytes) throw new VideoError("response"); chunks.push(part.value); }
      if (!size) throw new VideoError("response");
      const bytes = Buffer.concat(chunks, size);
      // AITUNNEL can serve a valid MP4 as generic binary. Accept only after
      // validating the container, H.264 video track, dimensions and duration.
      if (genericBinary) inspectVideo(bytes, "video/mp4", this.downloadLimits.duration, this.downloadLimits.pixels);
      return { bytes, mimeType: "video/mp4" };
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    finally { reader.releaseLock(); }
  }
}
