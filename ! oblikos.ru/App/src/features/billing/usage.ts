import "server-only";
import { createHmac } from "node:crypto";
import { currentWorkspace } from "@/features/auth/access";
import { authEnvironment } from "@/features/auth/config";
import { assertGenerationEnabled, generationLimits, GenerationSafetyError } from "@/features/ai/safety";
import { getDatabase } from "@/db/client";

export async function currentUsage() {
  const { userId, workspaceId } = await currentWorkspace();
  const secret = authEnvironment().secret;
  const kinds = ["text", "image", "video", "voice"] as const;
  const now = new Date();
  const limits = kinds.map((kind) => {
    const [, daily, global] = generationLimits(kind);
    let enabled = true;
    try { assertGenerationEnabled(kind); }
    catch (error) { if (!(error instanceof GenerationSafetyError)) throw error; enabled = false; }
    const scopes = [["user-day", userId, daily], ["workspace-day", workspaceId, daily], ["global-day", "application", global]] as const;
    return { kind, daily, enabled, scopes: scopes.map(([scope, id, limit]) => ({
      key: createHmac("sha256", secret).update(`generation:${kind}:${scope}:${id}`).digest("hex"), limit,
    })) };
  });
  const rows = await getDatabase().authRateLimit.findMany({
    where: { key: { in: limits.flatMap((item) => item.scopes.map((scope) => scope.key)) }, expiresAt: { gt: now } },
    select: { key: true, attempts: true, expiresAt: true },
  });
  const counters = new Map(rows.map((row) => [row.key, row]));
  return limits.map(({ kind, daily, enabled, scopes }) => ({
    kind, limit: daily, enabled,
    remaining: enabled ? Math.max(0, Math.min(...scopes.map(({ key, limit }) => limit - (counters.get(key)?.attempts || 0)))) : 0,
    resetsAt: scopes.map(({ key }) => counters.get(key)?.expiresAt.toISOString()).filter((date): date is string => Boolean(date)).sort().at(-1) || null,
  }));
}
