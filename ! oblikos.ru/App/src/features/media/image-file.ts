import "server-only";
import sharp from "sharp";
import { ImageError } from "@/features/ai/image-types";

export const maxImageBytes = 20 * 1024 * 1024;
export async function inspectImage(bytes: Buffer) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16 || bytes.length > maxImageBytes) throw new ImageError("response");
  const header = bytes.subarray(0, 12);
  const png = header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const webp = header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new ImageError("response");
  try {
    const metadata = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" }).metadata();
    const formats = { png: { mimeType: "image/png", extension: "png" }, jpeg: { mimeType: "image/jpeg", extension: "jpg" }, webp: { mimeType: "image/webp", extension: "webp" } };
    if (!metadata.format || !(metadata.format in formats) || !metadata.width || !metadata.height || (metadata.pages || 1) !== 1) throw new ImageError("response");
    // Decode once to reject truncated/corrupt data. Original bytes are stored unchanged.
    await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" }).stats();
    return { ...formats[metadata.format as keyof typeof formats], width: metadata.width, height: metadata.height, fileSize: bytes.length };
  } catch { throw new ImageError("response"); }
}
