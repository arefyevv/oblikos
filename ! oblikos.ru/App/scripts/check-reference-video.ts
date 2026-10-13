import "dotenv/config";
import { getDatabase } from "../src/db/client";
import { motionProvider, motionEngine } from "../src/features/ai/performance-provider";
import { AitunnelAvatarProvider } from "../src/features/ai/avatar-provider";
import { performancePrice } from "../src/features/media/performance-cost";
import { assertGenerationEnabled } from "../src/features/ai/safety";
import { originalSoundAvailable } from "../src/features/media/original-video-sound";
import { configuredMotionModel, motionModelSettings } from "../src/features/ai/motion-model";

// Read-only: no provider submission, dispatch, polling or fixture records.
const db = getDatabase();
try {
  assertGenerationEnabled("video");
  if (motionEngine() !== "aitunnel") throw new Error("Expected AITUNNEL motion configuration");
  const response = await fetch("https://api.aitunnel.ru/public/aitunnel/models/videos", { signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error("Public model catalog unavailable");
  const settings = motionModelSettings(configuredMotionModel());
  const catalog = await response.json(), motion = catalog[configuredMotionModel()], avatar = catalog["avatar-iv"];
  if (!motion?.supports_input_references || !motion.modalities?.input?.includes("video") || !motion.modalities?.input?.includes("image") || !Object.values(settings.sizes).every(size => motion.supported_sizes?.includes(size)) || !Array.from({ length: 16 - settings.minDuration }, (_, i) => i + settings.minDuration).every(n => motion.supported_durations?.includes(n))) throw new Error("Model capabilities changed; review adapter before enabling");
  const quote = performancePrice("PERFORMANCE", 1), audio = performancePrice("AUDIO", 1);
  if (!Object.entries(settings.sizes).every(([ratio, size]) => Math.abs(Math.ceil(Math.round(Number(motion.size_prices?.[size]) * 1000000) / 100) / 10000 - performancePrice("PERFORMANCE", 1, ratio).amount) < 0.000001) || Number(avatar?.max_price_per_second) !== audio.amount) throw new Error("Configured rates differ from the public catalog");
  const pending = await db.mediaGeneration.count({ where: { type: "VIDEO", mode: { in: ["AUDIO", "PERFORMANCE"] }, status: { in: ["PENDING", "PROCESSING"] } } });
  if (!originalSoundAvailable()) throw new Error("Original sound processor unavailable");
  console.log(JSON.stringify({ motion: motionProvider().configuration(), audio: new AitunnelAvatarProvider().configuration(), motionRate: quote, audioRate: audio, originalSound: true, groupDirection: "EXPERIMENTAL", workerEnabled: process.env.REFERENCE_VIDEO_WORKER_ENABLED === "true", pendingReferenceJobs: pending, paidRequests: 0 }));
  if (process.argv.includes("--require-empty") && pending) throw new Error("Existing reference jobs require review before starting worker");
} catch { console.error("Reference video readiness failed. Check keys, rates, catalog capabilities and pending jobs; no paid request was sent."); process.exitCode = 1; }
finally { await db.$disconnect(); }
