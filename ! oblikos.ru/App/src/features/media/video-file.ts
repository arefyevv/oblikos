import "server-only";
import { VideoError } from "@/features/ai/video-types";
// MVP: up to 12 seconds at 720p, with ample room for high bitrate MP4.
export const maxVideoBytes = 100 * 1024 * 1024;
type Box = { type: string; start: number; end: number };
function boxes(bytes: Buffer, start: number, end: number): Box[] {
  const result: Box[] = [];
  while (start < end) {
    if (start + 8 > end || result.length > 10000) throw new VideoError("response");
    let size = bytes.readUInt32BE(start), header = 8;
    if (size === 1) {
      if (start + 16 > end) throw new VideoError("response");
      const wide = bytes.readBigUInt64BE(start + 8);
      if (wide > BigInt(Number.MAX_SAFE_INTEGER)) throw new VideoError("response");
      size = Number(wide); header = 16;
    } else if (size === 0) size = end - start;
    if (size < header || start + size > end) throw new VideoError("response");
    result.push({ type: bytes.toString("ascii", start + 4, start + 8), start: start + header, end: start + size });
    start += size;
  }
  return result;
}
export function inspectVideo(bytes: Buffer, mimeType: string, maxDuration = 13, maxPixels = 1280 * 1280) {
  if (mimeType.split(";")[0].trim().toLowerCase() !== "video/mp4" || bytes.length < 100 || bytes.length > maxVideoBytes) throw new VideoError("response");
  const root = boxes(bytes, 0, bytes.length);
  const ftyp = root.find((b) => b.type === "ftyp"), moov = root.find((b) => b.type === "moov"), mdat = root.find((b) => b.type === "mdat" && b.end > b.start);
  if (!ftyp || ftyp.end - ftyp.start < 8 || !moov || !mdat) throw new VideoError("response");
  const brands = bytes.toString("ascii", ftyp.start, ftyp.end);
  if (!/(isom|iso[2-9]|mp4[12]|avc1)/.test(brands)) throw new VideoError("response");
  const children = boxes(bytes, moov.start, moov.end);
  const mvhd = children.find((b) => b.type === "mvhd");
  if (!mvhd || mvhd.end - mvhd.start < 20) throw new VideoError("response");
  const version = bytes[mvhd.start];
  if (version !== 0 && version !== 1) throw new VideoError("response");
  const timeOffset = mvhd.start + (version === 1 ? 20 : 12);
  if (timeOffset + (version === 1 ? 12 : 8) > mvhd.end) throw new VideoError("response");
  const scale = bytes.readUInt32BE(timeOffset);
  const ticks = version === 1 ? Number(bytes.readBigUInt64BE(timeOffset + 4)) : bytes.readUInt32BE(timeOffset + 4);
  const duration = ticks / scale;
  let width = 0, height = 0;
  for (const trak of children.filter((b) => b.type === "trak")) {
    const parts = boxes(bytes, trak.start, trak.end);
    const tkhd = parts.find((b) => b.type === "tkhd"), mdia = parts.find((b) => b.type === "mdia");
    if (!tkhd || !mdia) continue;
    const hdlr = boxes(bytes, mdia.start, mdia.end).find((b) => b.type === "hdlr");
    if (!hdlr || hdlr.start + 12 > hdlr.end || bytes.toString("ascii", hdlr.start + 8, hdlr.start + 12) !== "vide") continue;
    if (tkhd.end - tkhd.start < 84) throw new VideoError("response");
    width = bytes.readUInt32BE(tkhd.end - 8) / 65536;
    height = bytes.readUInt32BE(tkhd.end - 4) / 65536;
    // Only browser-playable H.264 is accepted; no expensive transcoding stack.
    const minf = boxes(bytes, mdia.start, mdia.end).find((b) => b.type === "minf");
    const stbl = minf && boxes(bytes, minf.start, minf.end).find((b) => b.type === "stbl");
    const stsd = stbl && boxes(bytes, stbl.start, stbl.end).find((b) => b.type === "stsd");
    if (!stsd || stsd.end - stsd.start < 16 || !boxes(bytes, stsd.start + 8, stsd.end).some((b) => b.type === "avc1" || b.type === "avc3")) throw new VideoError("response");
    break;
  }
  if (!Number.isFinite(duration) || duration <= 0 || duration > maxDuration || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > maxPixels) throw new VideoError("response");
  return { extension: "mp4", mimeType: "video/mp4", width, height, duration, fileSize: bytes.length };
}
