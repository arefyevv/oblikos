import "server-only";
import { currentWorkspace } from "@/features/auth/access";
import { AitunnelAvatarProvider } from "@/features/ai/avatar-provider";
import { motionEngine, motionProvider } from "@/features/ai/performance-provider";
import { createPerformanceService } from "./performance-operations";
import { LocalStorageProvider } from "./storage";
import { performancePrice } from "./performance-cost";
import { assertGenerationEnabled } from "@/features/ai/safety";
import { originalSoundAvailable } from "./original-video-sound";
import { configuredMotionModel } from "@/features/ai/motion-model";
export function performanceAvailability() {
  const enabled = (mode: "AUDIO" | "PERFORMANCE") => {
    try { assertGenerationEnabled("video"); if (process.env.REFERENCE_VIDEO_WORKER_ENABLED !== "true") return false; performancePrice(mode, 1); return Boolean(process.env[mode === "AUDIO" || motionEngine() === "aitunnel" ? "AITUNNEL_API_KEY" : "FAL_KEY"]?.trim()); } catch { return false; }
  };
  let engine: "aitunnel" | "fal" = "aitunnel";
  try { engine = motionEngine(); } catch { /* Invalid configuration stays unavailable. */ }
  let model = "hailuo-3";
  try { model = configuredMotionModel(); } catch { /* Invalid model remains unavailable. */ }
  return { audio: enabled("AUDIO"), performance: enabled("PERFORMANCE"), motionEngine: engine, motionModel: model, originalSound: originalSoundAvailable() };
}
export const performanceVideos = createPerformanceService(async () => { const member = await currentWorkspace(); return { userId: member.userId, workspaceId: member.workspaceId }; }, { audio: new AitunnelAvatarProvider(), performance: motionProvider() }, new LocalStorageProvider());
