import "dotenv/config";
import { getDatabase } from "../src/db/client";
import { createPerformanceService } from "../src/features/media/performance-operations";
import { createVideoService } from "../src/features/media/video-operations";
import { AitunnelAvatarProvider } from "../src/features/ai/avatar-provider";
import { motionProvider, savedMotionProvider } from "../src/features/ai/performance-provider";
import { ProxyAPIVideoProvider } from "../src/features/ai/video-provider";
import { encodeKlingPrimaryImage } from "../src/features/ai/kling-reference";
import { LocalStorageProvider } from "../src/features/media/storage";
const db = getDatabase(), storage = new LocalStorageProvider(), audio = new AitunnelAvatarProvider(), performance = motionProvider();
const ordinary = new ProxyAPIVideoProvider(encodeKlingPrimaryImage, ["kwaivgi/kling-v3.0-pro"]);
let stopping = false;
process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
async function tick() {
  if (process.env.REFERENCE_VIDEO_WORKER_ENABLED !== "true") return;
  const jobs = await db.mediaGeneration.findMany({ where: { type: "VIDEO", mode: { in: ["AUDIO", "PERFORMANCE"] }, status: { in: ["PENDING", "PROCESSING"] } }, orderBy: { createdAt: "asc" }, take: 100 });
  for (const job of jobs) {
    if (stopping) break;
    if (!job.creatorUserId) continue;
    const context = async () => ({ userId: job.creatorUserId!, workspaceId: job.workspaceId });
    try {
      if (Date.now() - job.createdAt.getTime() > 10800000) {
        await db.mediaGeneration.updateMany({ where: { id: job.id, status: { in: ["PENDING", "PROCESSING"] }, OR: [{ pollLeaseUntil: null }, { pollLeaseUntil: { lte: new Date() } }] }, data: { status: "FAILED", errorCode: job.status === "PENDING" && job.submissionStartedAt ? "ambiguous" : "deadline" } }); continue;
      }
      await createPerformanceService(context, { audio, performance }, storage).dispatch(job.id);
      await createVideoService(context, ordinary, storage, { resolveProvider: (name, model) => name === "aitunnel-avatar" ? audio : savedMotionProvider(name, model) || ordinary }).status(job.id);
    } catch { console.error("Video worker job unavailable", job.id); }
  }
  const expired = await db.videoSource.findMany({ where: { expiresAt: { lte: new Date() } }, take: 100 });
  for (const source of expired) {
    if (await db.mediaGeneration.count({ where: { sourceId: source.id, status: { in: ["PENDING", "PROCESSING"] } } })) continue;
    // Keep non-secret metadata for the audit trail; delete bytes first, then receipt.
    await storage.delete(source.storageKey);
    await db.videoSource.deleteMany({ where: { id: source.id, expiresAt: { lte: new Date() } } });
  }
}
try {
  do { try { await tick(); } catch { console.error("Video worker tick failed"); } if (!stopping && !process.argv.includes("--once")) await new Promise(resolve => setTimeout(resolve, 20000)); }
  while (!stopping && !process.argv.includes("--once"));
} finally { await db.$disconnect(); }
