import { z } from "zod";
export const videoRequestSchema = z.strictObject({
  characterId: z.uuid(), scene: z.string().trim().min(1).max(3000),
  referenceAssetId: z.uuid().optional(),
  motion: z.string().trim().max(1000), aspectRatio: z.string().regex(/^\d{1,2}:\d{1,2}$/),
  duration: z.number().int().min(1).max(12),
});
export type VideoRequest = z.infer<typeof videoRequestSchema>;
export const talkingRequestSchema = videoRequestSchema.extend({ scene: z.string().trim().min(1).max(600), duration: z.union([z.literal(15), z.literal(30), z.literal(60)]), aspectRatio: z.enum(["9:16", "16:9", "1:1"]) });
export type VideoGenerationView = {
  id: string; characterId: string; characterName: string; scene: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  mediaId: string | null; message: string | null; createdAt: string;
  phase?: "SUBMITTING" | "QUEUED" | "GENERATING" | "SAVING" | "READY" | "FAILED";
};
