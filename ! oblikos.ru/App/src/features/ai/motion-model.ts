import "server-only";
import { VideoError } from "./video-types";

export type AitunnelMotionModel = "hailuo-3" | "seedance-2.0-mini";
export function configuredMotionModel(): AitunnelMotionModel {
  const model = process.env.MOTION_VIDEO_MODEL || "hailuo-3";
  if (model !== "hailuo-3" && model !== "seedance-2.0-mini") throw new VideoError("configuration");
  return model;
}
export function motionModelSettings(model: AitunnelMotionModel) {
  return model === "seedance-2.0-mini"
    ? { minDuration: 4, resolution: "720p", sizes: { "9:16": "720x1280", "16:9": "1280x720", "1:1": "720x720" } }
    : { minDuration: 5, resolution: "2K", sizes: { "9:16": "1440x2560", "16:9": "2560x1440", "1:1": "1440x1440" } };
}
