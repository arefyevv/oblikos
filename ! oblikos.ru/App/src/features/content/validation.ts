import { z } from "zod";
import { voiceDeliverySchema } from "@/features/voice/validation";

export const contentTypes = ["POST", "SHORT_POST", "CAPTION", "IDEA", "DESCRIPTION", "CUSTOM"] as const;
export type ContentType = typeof contentTypes[number];
export const contentLabels: Record<ContentType, string> = {
  POST: "Пост", SHORT_POST: "Короткий пост", CAPTION: "Подпись", IDEA: "Идея", DESCRIPTION: "Описание", CUSTOM: "Своя задача",
};
export const generationSchema = z.object({
  characterId: z.uuid("Выберите персонажа."),
  type: z.enum(contentTypes, { error: "Выберите тип контента." }),
  instruction: z.string().trim().min(1, "Опишите задачу.").max(5000, "Не более 5000 символов."),
}).strict();
export const bodySchema = z.object({ body: z.string().trim().min(1, "Текст не должен быть пустым.").max(30000, "Не более 30000 символов."), voiceOverride: voiceDeliverySchema.nullable().optional() }).strict();
export type GenerationInput = z.infer<typeof generationSchema>;
export type ContentResult = { ok: boolean; message: string; id?: string; errors?: Record<string, string>; terminal?: boolean };
