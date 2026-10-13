import "server-only";
import { z } from "zod";
import { VideoError, type VideoInput, type VideoJob, type VideoProvider, type VideoCapabilities } from "./video-types";
import { maxVideoBytes } from "@/features/media/video-file";

const settingsSchema = z.object({
  key: z.string().trim().min(1), model: z.string().trim().min(1).max(160),
  baseURL: z.url().refine((value) => { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && u.pathname.replace(/\/$/, "") === "/v1"; }),
});
const modelSchema = z.object({ id: z.string(), supported_frame_images: z.array(z.string()).nullish(), supported_durations: z.array(z.number().int()).nullish(), supported_aspect_ratios: z.array(z.string()).nullish(), supported_resolutions: z.array(z.string()).nullish() });
const jobSchema = z.object({ id: z.string().min(1).max(240), status: z.enum(["pending", "queued", "processing", "in_progress", "completed", "failed", "cancelled", "expired"]) });
// Encoder injection remains server-only; the app supplies the checked Kling codec.
export type VerifiedReferenceEncoder = (reference: VideoInput["reference"]) => Record<string, unknown>;
export class ProxyAPIVideoProvider implements VideoProvider {
  private cache?: { key: string; until: number; capabilities: VideoCapabilities };
  constructor(private encodeReference?: VerifiedReferenceEncoder, private supportedModels?: readonly string[]) {}
  private settings() {
    const parsed = settingsSchema.safeParse({ key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_VIDEO_MODEL, baseURL: process.env.OPENAI_BASE_URL });
    if (!parsed.success || (this.supportedModels && !this.supportedModels.includes(parsed.data.model))) throw new VideoError("configuration");
    return parsed.data;
  }
  configuration() { return { provider: "proxyapi-video", model: this.settings().model }; }
  private async request(path: string, timeout: number, method = "GET", body?: unknown) {
    const config = this.settings();
    try {
      const response = await fetch(`${config.baseURL.replace(/\/$/, "")}/${path}`, { method, headers: { Authorization: `Bearer ${config.key}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout), redirect: "error", cache: "no-store" });
      if (!response.ok) {
        await response.body?.cancel();
        throw new VideoError(response.status === 402 ? "balance" : response.status === 401 || response.status === 403 ? "configuration" : response.status === 400 ? "invalid" : response.status === 404 ? "missing" : "provider");
      }
      return response;
    } catch (e) {
      if (e instanceof VideoError) throw e;
      throw new VideoError(method === "POST" ? "ambiguous" : e instanceof Error && e.name === "TimeoutError" ? "timeout" : "provider");
    }
  }
  async capabilities(): Promise<VideoCapabilities> {
    const settings = this.settings(), key = `${settings.baseURL}:${settings.model}`;
    if (!this.encodeReference) throw new VideoError("configuration");
    if (this.cache && this.cache.key === key && this.cache.until > Date.now()) return this.cache.capabilities;
    const result = z.object({ data: z.array(modelSchema) }).safeParse(await (await this.request("videos/models", 15000)).json());
    if (!result.success) throw new VideoError("response");
    const model = result.data.data.find((m) => m.id === settings.model);
    if (!model?.supported_frame_images?.includes("first_frame") || !model.supported_resolutions?.includes("720p")) throw new VideoError("configuration");
    // MVP supports only 720p, 3/4/6/8 second combinations; high resolution
    // and model-dependent extra options are intentionally not inferred.
    const durations = (model.supported_durations || []).filter((d) => [3, 4, 6, 8].includes(d));
    const aspectRatios = (model.supported_aspect_ratios || []).filter((r) => ["16:9", "9:16", "1:1"].includes(r));
    if (!durations.length || !aspectRatios.length) throw new VideoError("configuration");
    const capabilities = { referenceImages: true, durations, aspectRatios };
    this.cache = { key, until: Date.now() + 60000, capabilities };
    return capabilities;
  }
  private job(value: unknown): VideoJob {
    const parsed = jobSchema.safeParse(value);
    if (!parsed.success) throw new VideoError("response");
    const g = parsed.data;
    const failed = ["failed", "cancelled", "expired"].includes(g.status);
    return { id: g.id, status: g.status === "completed" ? "READY" : failed ? "FAILED" : g.status === "pending" || g.status === "queued" ? "PENDING" : "PROCESSING", ...(failed ? { error: "provider" as const } : {}) };
  }
  async createVideo(input: VideoInput) {
    const capabilities = await this.capabilities();
    if (!capabilities.durations.includes(input.duration) || !capabilities.aspectRatios.includes(input.aspectRatio) || !this.encodeReference) throw new VideoError("invalid");
    const reference = this.encodeReference(input.reference);
    const response = await this.request("videos", 30000, "POST", { ...reference, model: this.settings().model, prompt: input.prompt, resolution: "720p", duration: input.duration, aspect_ratio: input.aspectRatio, generate_audio: false });
    try { return this.job(await response.json()); } catch { throw new VideoError("ambiguous"); }
  }
  async getVideoStatus(id: string) { return this.job(await (await this.request(`videos/${encodeURIComponent(id)}`, 15000)).json()); }
  async downloadVideo(id: string) {
    // Ignore unsigned_urls/polling_url: fixed same-origin endpoints, no redirects,
    // no arbitrary provider/user supplied URLs and no credential forwarding.
    const response = await this.request(`videos/${encodeURIComponent(id)}/content`, 60000);
    const mimeType = response.headers.get("content-type") || "";
    const declared = Number(response.headers.get("content-length"));
    if (mimeType.split(";")[0].trim().toLowerCase() !== "video/mp4" || declared > maxVideoBytes || !response.body) { await response.body?.cancel(); throw new VideoError("response"); }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.length;
        if (length > maxVideoBytes) throw new VideoError("response");
        chunks.push(part.value);
      }
      if (!length || (declared > 0 && length !== declared)) throw new VideoError("response");
      return { bytes: Buffer.concat(chunks, length), mimeType };
    } catch (e) { await reader.cancel().catch(() => undefined); if (e instanceof VideoError) throw e; throw new VideoError("timeout"); }
    finally { reader.releaseLock(); }
  }
}
