import { z } from "zod";

export const aspectRatios = ["1:1", "4:5", "16:9", "9:16"] as const;
export const imageFormats = { PORTRAIT: "Портрет", LIFESTYLE: "Lifestyle", SCENE: "Фото в сцене" } as const;
export const imageRequestSchema = z.strictObject({
  characterId: z.uuid(),
  instruction: z.string().trim().max(3000),
  format: z.enum(["PORTRAIT", "LIFESTYLE", "SCENE"]),
  aspectRatio: z.enum(aspectRatios),
});
export type ImageRequest = z.infer<typeof imageRequestSchema>;
export type MediaResult = { ok: boolean; message: string; id?: string; terminal?: boolean };
export type MediaView = { id: string; type: "IMAGE" | "VIDEO"; duration: number | null; referenceAssetId: string | null; characterId: string; characterName: string; createdAt: string; isPrimaryReference: boolean; prompt: string };
