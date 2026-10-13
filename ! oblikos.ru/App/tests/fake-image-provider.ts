import sharp from "sharp";
import type { ImageProvider, ImageProviderRequest, ImageOutput } from "../src/features/ai/image-types";

export class FakeImageProvider implements ImageProvider {
  requests: ImageProviderRequest[] = [];
  constructor(public referenceImages = true, private response?: (request: ImageProviderRequest) => Promise<ImageOutput>) {}
  capabilities() { return { referenceImages: this.referenceImages }; }
  async generateImage(request: ImageProviderRequest): Promise<ImageOutput> {
    this.requests.push(request);
    if (this.response) return this.response(request);
    return { bytes: await sharp({ create: { width: 120, height: 160, channels: 3, background: "#d3c1aa" } }).png().toBuffer(), provider: "fake", model: "test-image", referenceUsed: Boolean(request.referenceImages?.length) };
  }
}
