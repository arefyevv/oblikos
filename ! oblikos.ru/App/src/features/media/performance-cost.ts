import "server-only";
import { VideoError } from "@/features/ai/video-types";
import { motionEngine } from "@/features/ai/performance-provider";
import { configuredMotionModel, motionModelSettings } from "@/features/ai/motion-model";
export function performancePrice(mode: "AUDIO" | "PERFORMANCE", duration: number, aspectRatio = "9:16") {
  const rubles = mode === "AUDIO" || motionEngine() === "aitunnel";
  const mini = mode === "PERFORMANCE" && rubles && configuredMotionModel() === "seedance-2.0-mini";
  const raw = process.env[mode === "AUDIO" ? "AVATAR_PRICE_RUB_PER_SECOND" : mini ? aspectRatio === "1:1" ? "SEEDANCE_SQUARE_PRICE_RUB_PER_SECOND" : "SEEDANCE_PRICE_RUB_PER_SECOND" : rubles ? "MOTION_PRICE_RUB_PER_SECOND" : "MOTION_PRICE_USD_PER_SECOND"];
  if (!Number.isFinite(duration) || duration <= 0 || !raw || !/^\d+(\.\d{1,6})?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) <= 0 || Number(raw) > 10000) throw new VideoError("price");
  // Read the full catalog rate, then round the total up to the DB's four
  // decimal places. Never round the per-second rate before multiplication.
  return { amount: Math.ceil(duration * Math.round(Number(raw) * 1000000) / 100) / 10000, currency: rubles ? "RUB" as const : "USD" as const };
}
export function billedDuration(mode: "AUDIO" | "PERFORMANCE", duration: number, orientation: "image" | "video") {
  if (!Number.isFinite(duration) || duration <= 0) throw new VideoError("invalid");
  if (mode === "PERFORMANCE") {
    if (motionEngine() === "aitunnel") {
      const minimum = motionModelSettings(configuredMotionModel()).minDuration;
      if (duration < minimum || duration > 15 || orientation !== "video") throw new VideoError(configuredMotionModel() === "seedance-2.0-mini" ? "seedance_duration" : "reference_duration");
    } else if (duration < 3 || duration > (orientation === "image" ? 10 : 30)) throw new VideoError("invalid");
    return Math.ceil(duration);
  }
  const bucket = [5, 10, 15, 20, 30, 45, 60].find(value => value >= Math.ceil(duration));
  if (!bucket) throw new VideoError("speech_duration");
  return bucket;
}
