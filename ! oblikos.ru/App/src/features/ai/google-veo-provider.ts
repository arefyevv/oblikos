import "server-only";
import { GoogleGenAI, GenerateVideosOperation, type Image } from "@google/genai";
import { mkdtemp, readFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { VideoError, type VideoInput, type VideoJob, type VideoProvider } from "./video-types";
import { maxVideoBytes } from "@/features/media/video-file";
import { maxImageBytes } from "@/features/media/image-file";

// The SDK appends apiVersion; the unified native endpoint is /v1beta.
export const googleVideoBaseURL = "https://api.proxyapi.ru";
// Explicit mapping of documented Google Veo model versions, never prefix stripping.
const models: Record<string, string> = {
  "google/veo-3.1": "veo-3.1-generate-preview",
  "google/veo-3.1-fast": "veo-3.1-fast-generate-preview",
  "google/veo-3.1-lite": "veo-3.1-lite-generate-preview",
};
export function nativeVideoModel(catalogueModel: string) {
  const model = models[catalogueModel];
  if (!model) throw new VideoError("configuration");
  return model;
}
export function encodeGooglePrimaryImage(reference: VideoInput["reference"]): Image {
  if (!Buffer.isBuffer(reference.bytes) || !reference.bytes.length || reference.bytes.length > maxImageBytes || !["image/png", "image/jpeg", "image/webp"].includes(reference.mimeType)) throw new VideoError("reference");
  return { imageBytes: reference.bytes.toString("base64"), mimeType: reference.mimeType };
}
export class NativeVideoHTTPError extends VideoError {
  constructor(public readonly httpStatus: number) {
    super(httpStatus === 402 ? "balance" : [401, 403].includes(httpStatus) ? "configuration" : httpStatus === 400 ? "invalid" : httpStatus === 404 ? "missing" : "provider");
  }
}
export class ProxyAPIGoogleVeoProvider implements VideoProvider {
  private cache?: { model: string; until: number };
  private settings() {
    const key = process.env.OPENAI_API_KEY?.trim(), catalogueModel = process.env.OPENAI_VIDEO_MODEL?.trim();
    if (!key || !catalogueModel) throw new VideoError("configuration");
    return { key, catalogueModel, nativeModel: nativeVideoModel(catalogueModel) };
  }
  configuration() { return { provider: "proxyapi-google-veo", model: this.settings().catalogueModel }; }
  private client(timeout = 15000) {
    return new GoogleGenAI({ apiKey: this.settings().key, httpOptions: {
      baseUrl: googleVideoBaseURL, apiVersion: "v1beta", timeout, retryOptions: { attempts: 1 },
      // SDK owns serialization/download. Transport enforces origin, redirect and
      // streaming size restrictions without ever logging credentials or payloads.
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.origin !== "https://api.proxyapi.ru" || !url.pathname.startsWith("/v1beta/") || url.username || url.password || url.hash) throw new VideoError("response");
        const response = await fetch(input, { ...init, redirect: "error", cache: "no-store" });
        if (!response.ok) { await response.body?.cancel(); throw new NativeVideoHTTPError(response.status); }
        if (!url.pathname.includes("/files/")) return response;
        if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "video/mp4" || Number(response.headers.get("content-length")) > maxVideoBytes || !response.body) { await response.body?.cancel(); throw new VideoError("response"); }
        const reader = response.body.getReader(), chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const item = await reader.read(); if (item.done) break;
            size += item.value.byteLength;
            if (size > maxVideoBytes) throw new VideoError("response");
            chunks.push(item.value);
          }
          const declared = Number(response.headers.get("content-length"));
          if (!size || (declared > 0 && declared !== size)) throw new VideoError("response");
          return new Response(Buffer.concat(chunks, size), { status: response.status, headers: response.headers });
        } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
        finally { reader.releaseLock(); }
      },
    } });
  }
  async capabilities() {
    const model = this.settings().nativeModel;
    if (!this.cache || this.cache.model !== model || this.cache.until <= Date.now()) {
      try {
        const pager = await this.client().models.list({ config: { pageSize: 100 } });
        let found = false, count = 0;
        for await (const item of pager) {
          if (item.name === `models/${model}` && item.supportedActions?.includes("predictLongRunning")) { found = true; break; }
          if (++count >= 200) break;
        }
        if (!found) throw new VideoError("configuration");
        this.cache = { model, until: Date.now() + 60000 };
      } catch (error) { throw this.safeError(error); }
    }
    // Documented native Veo 3.1 family combinations at fixed MVP resolution 720p.
    return { referenceImages: true, durations: [4, 6, 8], aspectRatios: ["16:9", "9:16"] };
  }
  private operationName(name?: string) {
    const model = this.settings().nativeModel;
    if (!name || name.length > 240 || !new RegExp(`^models/${model.replaceAll(".", "\\.")}/operations/[A-Za-z0-9_-]+$`).test(name)) throw new VideoError("response");
    return name;
  }
  private job(operation: GenerateVideosOperation): VideoJob {
    const id = this.operationName(operation.name);
    if (operation.error) return { id, status: "FAILED", error: "provider" };
    if (!operation.done) return { id, status: "PROCESSING" };
    if (operation.response?.raiMediaFilteredCount) return { id, status: "FAILED", error: "moderation" };
    if (operation.response?.generatedVideos?.length !== 1) throw new VideoError("response");
    return { id, status: "READY" };
  }
  private safeError(error: unknown, create = false): VideoError {
    if (error instanceof VideoError) return error;
    return new VideoError(create ? "ambiguous" : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "provider");
  }
  async createVideo(input: VideoInput) {
    const caps = await this.capabilities();
    if (!caps.durations.includes(input.duration) || !caps.aspectRatios.includes(input.aspectRatio)) throw new VideoError("invalid");
    const image = encodeGooglePrimaryImage(input.reference);
    try {
      const operation = await this.client(30000).models.generateVideos({ model: this.settings().nativeModel, prompt: input.prompt, image,
        config: { durationSeconds: input.duration, resolution: "720p", aspectRatio: input.aspectRatio, numberOfVideos: 1 } });
      return this.job(operation);
    } catch (error) { throw this.safeError(error, true); }
  }
  private async operation(id: string) {
    const operation = new GenerateVideosOperation(); operation.name = this.operationName(id);
    const result = await this.client().operations.getVideosOperation({ operation });
    if (result.name !== id) throw new VideoError("response");
    return result;
  }
  async getVideoStatus(id: string) {
    try { return this.job(await this.operation(id)); } catch (error) { throw this.safeError(error); }
  }
  async downloadVideo(id: string) {
    const directory = await mkdtemp(path.join(tmpdir(), "oblikos-veo-")), target = path.join(directory, "result.mp4");
    try {
      const operation = await this.operation(id);
      if (this.job(operation).status !== "READY") throw new VideoError("response");
      const video = operation.response!.generatedVideos![0].video;
      if (!video || (video.mimeType && video.mimeType !== "video/mp4")) throw new VideoError("response");
      // Pass only a validated file resource to SDK; never fetch returned URLs.
      let file: { uri: string } | { videoBytes: string; mimeType: string };
      if (video.uri) {
        const uri = new URL(video.uri);
        if (!["https://generativelanguage.googleapis.com", "https://api.proxyapi.ru"].includes(uri.origin) || uri.username || uri.password || uri.hash) throw new VideoError("response");
        const match = uri.pathname.match(/^\/(?:google\/)?v1beta\/files\/([a-z0-9]+)(?::download)?$/);
        if (!match) throw new VideoError("response");
        file = { uri: `files/${match[1]}` };
      } else if (video.videoBytes && video.videoBytes.length <= Math.ceil(maxVideoBytes / 3) * 4) {
        file = { videoBytes: video.videoBytes, mimeType: "video/mp4" };
      } else throw new VideoError("response");
      await this.client(60000).files.download({ file, downloadPath: target });
      const bytes = await readFile(target);
      if (!bytes.length || bytes.length > maxVideoBytes) throw new VideoError("response");
      return { bytes, mimeType: "video/mp4" };
    } catch (error) { throw this.safeError(error); }
    finally { await unlink(target).catch(() => undefined); await rmdir(directory).catch(() => undefined); }
  }
}
