import "server-only";
import { createHmac } from "node:crypto";
import { getDatabase } from "@/db/client";
import { authEnvironment } from "@/features/auth/config";

export class GenerationSafetyError extends Error {
  constructor(public readonly code: "disabled" | "configuration" | "rate_limit") { super(code); }
}
export const generationSafetyMessages = {
  disabled: "Генерация временно отключена. Сохранённые материалы доступны.",
  configuration: "Генерация пока не настроена. Обратитесь к администратору.",
  rate_limit: "Достигнут лимит генераций. Попробуйте позже.",
} as const;
type Kind = "text" | "image" | "video" | "voice" | "upload";
function flag(name: string) {
  const value = process.env[name] ?? "true";
  if (!["true", "false"].includes(value)) throw new GenerationSafetyError("configuration");
  return value === "true";
}
export function assertGenerationEnabled(kind: Kind) {
  if (kind === "upload") return;
  if (!flag("AI_GENERATION_ENABLED") || (kind === "image" && !flag("IMAGE_GENERATION_ENABLED")) || (kind === "video" && !flag("VIDEO_GENERATION_ENABLED")) || (kind === "voice" && !flag("VOICE_GENERATION_ENABLED"))) throw new GenerationSafetyError("disabled");
}
export function generationLimits(kind: Kind) {
  const prefix = kind === "upload" ? "MEDIA_UPLOAD" : kind === "text" ? "AI_TEXT" : kind === "image" ? "AI_IMAGE" : kind === "voice" ? "AI_VOICE" : "AI_VIDEO";
  const defaults = kind === "upload" ? [5, 30, 200] : kind === "text" ? [5, 50, 200] : kind === "image" ? [2, 10, 40] : kind === "voice" ? [3, 20, 100] : [1, 5, 20];
  return ["PER_MINUTE", "PER_DAY", "GLOBAL_PER_DAY"].map((suffix, i) => {
    const raw = process.env[`${prefix}_${suffix}`];
    if (raw !== undefined && !/^[1-9]\d*$/.test(raw)) throw new GenerationSafetyError("configuration");
    const value = raw === undefined ? defaults[i] : Number(raw);
    if (!Number.isSafeInteger(value) || value > [100, 500, 5000][i]) throw new GenerationSafetyError("configuration");
    return value;
  });
}

// Atomic all-or-nothing reservation in the existing PostgreSQL limiter table.
// Shared across Node processes, persists on restart. Fail closed if DB unavailable.
export async function reserveGeneration(kind: Kind, context: { userId: string; workspaceId: string }) {
  assertGenerationEnabled(kind);
  const [minute, daily, global] = generationLimits(kind);
  const windows = [
    ["user-minute", context.userId, minute, 60], ["workspace-minute", context.workspaceId, minute, 60],
    ["user-day", context.userId, daily, 86400], ["workspace-day", context.workspaceId, daily, 86400],
    ["global-day", "application", global, 86400],
  ] as const;
  const secret = authEnvironment().secret;
  await getDatabase().$transaction(async (tx) => {
    for (const [scope, id, limit, seconds] of windows) {
      const key = createHmac("sha256", secret).update(`generation:${kind}:${scope}:${id}`).digest("hex");
      const rows = await tx.$queryRaw<{ attempts: number }[]>`
        INSERT INTO "AuthRateLimit" ("key", "attempts", "expiresAt")
        VALUES (${key}, 1, NOW() + ${seconds} * INTERVAL '1 second')
        ON CONFLICT ("key") DO UPDATE SET
          "attempts" = CASE WHEN "AuthRateLimit"."expiresAt" <= NOW() THEN 1 ELSE "AuthRateLimit"."attempts" + 1 END,
          "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= NOW() THEN NOW() + ${seconds} * INTERVAL '1 second' ELSE "AuthRateLimit"."expiresAt" END
        RETURNING "attempts"`;
      if (rows[0].attempts > limit) throw new GenerationSafetyError("rate_limit");
    }
  });
}
