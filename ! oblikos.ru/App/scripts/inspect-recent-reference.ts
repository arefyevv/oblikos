import "dotenv/config";
import { getDatabase } from "../src/db/client";
import { AitunnelAvatarProvider } from "../src/features/ai/avatar-provider";
import { videoDiagnostic } from "../src/features/ai/video-diagnostic";
class Inspector extends AitunnelAvatarProvider {
  async inspect(id: string) {
    const raw = await (await this.request(`videos/${encodeURIComponent(id)}`)).json();
    return { status: raw.status, costRub: raw.usage?.cost_rub, diagnostic: raw.error ? await videoDiagnostic(Response.json({ error: raw.error }, { status: 400 }), {}, this.key()) : undefined };
  }
}
const db = getDatabase();
try {
  const jobs = await db.mediaGeneration.findMany({ where: { type: "VIDEO", mode: "PERFORMANCE" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, createdAt: true, status: true, model: true, provider: true, providerJobId: true, errorCode: true, mediaId: true, duration: true, quotedCost: true, pollAttempts: true, nextPollAt: true, pollLeaseUntil: true, submissionStartedAt: true } });
  for (const job of jobs) {
    let remote: unknown;
    if (job.provider === "aitunnel-motion" && job.providerJobId) {
      try { remote = await new Inspector().inspect(job.providerJobId); }
      catch { remote = { inspectionFailed: true }; }
    }
    console.log(JSON.stringify({ ...job, remote }));
  }
} finally { await db.$disconnect(); }
