import "server-only";
import OpenAI, { toFile } from "openai";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ImageError, type ImageProvider, type ImageProviderRequest } from "./image-types";
import { maxImageBytes } from "@/features/media/image-file";

const config = z.object({
  key: z.string().trim().min(1), model: z.string().trim().min(1).max(160),
  baseURL: z.url().refine((value) => { const url = new URL(value); return (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")) && !url.username && !url.password && !url.search && !url.hash; }).optional(),
  reference: z.enum(["true", "false"]).default("false"),
  sizes: z.string().default("1024x1024,1024x1536,1536x1024").refine((s) => s.split(",").every((v) => /^\d{3,4}x\d{3,4}$/.test(v.trim()))),
});
function configuration() {
  const parsed = config.safeParse({ key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_IMAGE_MODEL, baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined, reference: process.env.OPENAI_IMAGE_REFERENCE_SUPPORTED, sizes: process.env.OPENAI_IMAGE_SIZES });
  if (!parsed.success) throw new ImageError("configuration");
  return parsed.data;
}
export class OpenAICompatibleImageProvider implements ImageProvider {
  capabilities() { return { referenceImages: configuration().reference === "true" }; }
  async generateImage(request: ImageProviderRequest) {
    if (!request.prompt.trim() || request.prompt.length > 30000) throw new ImageError("response");
    const settings = configuration();
    if (settings.model === "google/gemini-3.1-flash-image") {
      if (settings.baseURL?.replace(/\/$/, "") !== "https://api.proxyapi.ru/v1") throw new ImageError("configuration");
      const referenceUsed = settings.reference === "true" && Boolean(request.referenceImages?.length);
      const client = new GoogleGenAI({ apiKey: settings.key, httpOptions: {
        baseUrl: "https://api.proxyapi.ru", apiVersion: "v1beta", timeout: 180000, retryOptions: { attempts: 1 },
        fetch: (input, init) => fetch(input, { ...init, redirect: "error", cache: "no-store" }),
      } });
      try {
        const result = await client.models.generateContent({
          model: "gemini-3.1-flash-image",
          contents: [{ role: "user", parts: [
            { text: request.prompt },
            ...(referenceUsed ? request.referenceImages!.map((photo) => ({ inlineData: { mimeType: photo.mimeType, data: photo.bytes.toString("base64") } })) : []),
          ] }],
          config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: request.aspectRatio, imageSize: "1K" } },
        });
        const images = result.candidates?.length === 1 ? result.candidates[0].content?.parts?.filter((part) => part.inlineData) : undefined;
        const encoded = images?.length === 1 ? images[0].inlineData?.data : undefined;
        if (!images?.[0]?.inlineData?.mimeType?.startsWith("image/") || !encoded || encoded.length > Math.ceil(maxImageBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new ImageError("response");
        return { bytes: Buffer.from(encoded, "base64"), provider: "proxyapi-google", model: settings.model, referenceUsed };
      } catch (error) {
        if (error instanceof ImageError) throw error;
        if (error instanceof ApiError) {
          if (error.status === 429) throw new ImageError("rate_limit");
          if ([401, 403].includes(error.status)) throw new ImageError("configuration");
          if ([408, 504].includes(error.status)) throw new ImageError("timeout");
          throw new ImageError("provider");
        }
        if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) throw new ImageError("timeout");
        throw new ImageError("network");
      }
    }
    const target = request.aspectRatio.split(":").map(Number);
    const size = settings.sizes.split(",").map((s) => s.trim()).sort((a, b) => {
      const ratio = (s: string) => { const [w, h] = s.split("x").map(Number); return Math.abs(Math.log((w / h) / (target[0] / target[1]))); };
      return ratio(a) - ratio(b);
    })[0];
    const client = new OpenAI({ apiKey: settings.key, baseURL: settings.baseURL, timeout: 180000, maxRetries: 0, logLevel: "off" });
    const referenceUsed = settings.reference === "true" && Boolean(request.referenceImages?.length);
    try {
      const common = { model: settings.model, prompt: request.prompt, size, n: 1 };
      const referenceFiles = referenceUsed ? await Promise.all(request.referenceImages!.map((photo, index) => toFile(photo.bytes, `reference-${index}.${photo.mimeType === "image/jpeg" ? "jpg" : photo.mimeType === "image/webp" ? "webp" : "png"}`, { type: photo.mimeType }))) : [];
      const result = referenceUsed
        ? await client.images.edit({ ...common, image: referenceFiles.length === 1 ? referenceFiles[0] : referenceFiles })
        : await client.images.generate(common);
      // ProxyAPI returns base64. Do not fetch arbitrary provider URLs (SSRF).
      const encoded = result.data?.length === 1 ? result.data[0].b64_json : undefined;
      if (!encoded || encoded.length > Math.ceil(maxImageBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new ImageError("response");
      return { bytes: Buffer.from(encoded, "base64"), provider: "openai-compatible", model: settings.model, referenceUsed };
    } catch (error) {
      if (error instanceof ImageError) throw error;
      if (error instanceof OpenAI.APIConnectionTimeoutError) throw new ImageError("timeout");
      if (error instanceof OpenAI.RateLimitError) throw new ImageError("rate_limit");
      if (error instanceof OpenAI.AuthenticationError) throw new ImageError("configuration");
      if (error instanceof OpenAI.APIConnectionError) throw new ImageError("network");
      throw new ImageError("provider");
    }
  }
}
