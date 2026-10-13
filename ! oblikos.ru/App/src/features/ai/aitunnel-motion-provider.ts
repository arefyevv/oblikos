import "server-only";
import { AitunnelAvatarProvider } from "./avatar-provider";
import { VideoError, type VideoInput } from "./video-types";
import { assertOwnVideoInputUrl } from "@/features/media/signed-video-input";
import { configuredMotionModel, motionModelSettings, type AitunnelMotionModel } from "./motion-model";

// Reuse the existing fixed-host queue/download transport, overriding all model
// inputs. Seedance Mini: 720p, 4–15s; legacy Hailuo: 2K, 5–15s.
export const aitunnelMotionModel = "hailuo-3";
export class AitunnelMotionProvider extends AitunnelAvatarProvider {
  constructor(private readonly savedModel?: AitunnelMotionModel) { super(); }
  protected override downloadLimits = { duration: 16, pixels: 2560 * 1440 };
  override configuration() { this.key(); return { provider: "aitunnel-motion", model: this.savedModel || configuredMotionModel() }; }
  override async capabilities() {
    const settings = motionModelSettings(this.configuration().model);
    return { referenceImages: true, durations: Array.from({ length: 16 - settings.minDuration }, (_, i) => i + settings.minDuration), aspectRatios: Object.keys(settings.sizes) };
  }
  override async createVideo(input: VideoInput) {
    const capabilities = await this.capabilities(), source = input.performance;
    const model = this.configuration().model, sizes: Record<string, string> = motionModelSettings(model).sizes;
    // keepOriginalSound is fulfilled by the local completion pipeline. It is not
    // a provider parameter and must never be represented as a lip-sync guarantee.
    if (!source?.bytes.length || source.mimeType !== "video/mp4" || input.audio || source.orientation !== "video" || !capabilities.durations.includes(input.duration) || !sizes[input.aspectRatio] || !input.reference.bytes.length || !["image/jpeg", "image/png", "image/webp"].includes(input.reference.mimeType)) throw new VideoError("invalid");
    const data = (file: { bytes: Buffer; mimeType: string; url?: string }) => file.url ? assertOwnVideoInputUrl(file.url) : `data:${file.mimeType};base64,${file.bytes.toString("base64")}`;
    const response = await this.request("videos", {
      model, prompt: input.prompt, duration: input.duration,
      size: sizes[input.aspectRatio], generate_audio: true,
      input_references: [
        { type: "video_url", video_url: { url: data(source) } },
        { type: "image_url", image_url: { url: data(input.reference) } },
      ],
    });
    try { return this.job(await response.json()); } catch { throw new VideoError("ambiguous"); }
  }
}
