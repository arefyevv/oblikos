import { z } from "zod";
export const performanceRequestSchema = z.strictObject({
  characterId: z.uuid(), referenceAssetId: z.uuid(), sourceId: z.uuid(),
  mode: z.enum(["AUDIO", "PERFORMANCE"]), motion: z.string().trim().max(1000).default(""),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  orientation: z.enum(["image", "video"]).default("video"), keepOriginalSound: z.boolean().default(true),
  cast: z.enum(["SINGLE", "GROUP"]).optional(), roles: z.string().trim().max(1000).optional(),
}).superRefine((input, ctx) => {
  if (input.mode === "AUDIO" && (input.orientation !== "video" || !input.keepOriginalSound)) ctx.addIssue({ code: "custom", message: "Настройки видеореференса не применяются к аудио." });
  if ((input.cast === "GROUP" && (input.mode !== "PERFORMANCE" || !input.roles?.trim())) || (input.roles && input.cast !== "GROUP")) ctx.addIssue({ code: "custom", message: "Для группы опишите, кто кого заменяет в видеореференсе." });
});
export type PerformanceRequest = z.infer<typeof performanceRequestSchema>;
export type SourceView = { id: string; kind: string; duration: number; hasAudio: boolean; expiresAt: string };
export type PerformanceQuote = { amount: number; currency: "RUB" | "USD"; model: string; duration: number; sourceDuration: number; sourceId: string; fingerprint: string };
