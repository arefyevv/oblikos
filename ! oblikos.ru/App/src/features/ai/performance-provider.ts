import "server-only";
import { VideoError, type VideoProvider } from "./video-types";
import { AitunnelMotionProvider } from "./aitunnel-motion-provider";
import { FalMotionProvider } from "./motion-provider";

export function motionEngine(): "aitunnel" | "fal" {
  const value = process.env.MOTION_VIDEO_PROVIDER || "aitunnel";
  if (value !== "aitunnel" && value !== "fal") throw new VideoError("configuration");
  return value;
}
export function motionProvider(): VideoProvider { return motionEngine() === "aitunnel" ? new AitunnelMotionProvider() : new FalMotionProvider(); }
// Saved jobs keep using their original provider after configuration changes.
export function savedMotionProvider(name: string | null, model: string | null): VideoProvider | undefined {
  if (name === "aitunnel-motion" && (model === "hailuo-3" || model === "seedance-2.0-mini")) return new AitunnelMotionProvider(model);
  if (name === "fal-motion" && model === "fal-ai/kling-video/v3/pro/motion-control") return new FalMotionProvider();
}
