import { VideoError, type VideoInput } from "./video-types";
import { maxImageBytes } from "@/features/media/image-file";

// OpenRouter frame_images shape; inline portrait accepted by ProxyAPI/Kling
// in the live check recorded in artifacts/kling-live-20261006.json.
export function encodeKlingPrimaryImage(reference: VideoInput["reference"]) {
  if (!Buffer.isBuffer(reference.bytes) || !reference.bytes.length || reference.bytes.length > maxImageBytes
    || !["image/png", "image/jpeg", "image/webp"].includes(reference.mimeType)) throw new VideoError("reference");
  return { frame_images: [{ type: "image_url", frame_type: "first_frame",
    image_url: { url: `data:${reference.mimeType};base64,${reference.bytes.toString("base64")}` },
  }] };
}
