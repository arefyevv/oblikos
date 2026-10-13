import "dotenv/config";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createHmac } from "node:crypto";
import { getDatabase } from "../src/db/client";
import { mediaStorageDirectory } from "../src/lib/server/environment";
import { authEnvironment } from "../src/features/auth/config";
import { generationLimits } from "../src/features/ai/safety";
const db = getDatabase();
try {
  const g = await db.mediaGeneration.findUniqueOrThrow({ where: { id: "29f5ca90-4058-4e2b-92d5-a190e3dd78b9" } });
  const s = await db.videoSource.findUniqueOrThrow({ where: { id: g.sourceId! } });
  const a = await db.mediaAsset.findUniqueOrThrow({ where: { id: g.referenceAssetId! } });
  for (const [kind, key] of [["video", s.storageKey], ["image", a.storageKey]]) {
    const f = await stat(path.join(mediaStorageDirectory(), key));
    console.log(JSON.stringify({ kind, uid: f.uid, gid: f.gid, mode: (f.mode & 0o777).toString(8), size: f.size }));
  }
  console.log(JSON.stringify({ status: g.status, providerJobId: g.providerJobId, sourceExpires: s.expiresAt }));
  const [minute, daily, global] = generationLimits("video");
  for (const [scope, identity, limit] of [["user-minute", g.creatorUserId!, minute], ["workspace-minute", g.workspaceId, minute], ["user-day", g.creatorUserId!, daily], ["workspace-day", g.workspaceId, daily], ["global-day", "application", global]] as const) {
    const key = createHmac("sha256", authEnvironment().secret).update(`generation:video:${scope}:${identity}`).digest("hex");
    const counter = await db.authRateLimit.findUnique({ where: { key }, select: { attempts: true, expiresAt: true } });
    console.log(JSON.stringify({ scope, limit, ...counter }));
  }
} finally { await db.$disconnect(); }
