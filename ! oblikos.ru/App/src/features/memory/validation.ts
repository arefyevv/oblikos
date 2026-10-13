import { z } from "zod";

export const memoryTypes = ["FACT", "PREFERENCE", "EVENT", "RELATIONSHIP", "GOAL", "RULE", "OTHER"] as const;
export type MemoryType = typeof memoryTypes[number];
export const memoryLabels: Record<MemoryType, string> = {
  FACT: "Факт", PREFERENCE: "Предпочтение", EVENT: "Событие", RELATIONSHIP: "Отношения",
  GOAL: "Цель", RULE: "Правило", OTHER: "Другое",
};
export const importanceLabels = ["Низкая", "Ниже средней", "Обычная", "Важная", "Критичная"] as const;
export const memorySchema = z.object({
  type: z.enum(memoryTypes, { error: "Выберите тип памяти." }),
  content: z.string().trim().min(1, "Введите содержание воспоминания.").max(2000, "Не более 2000 символов."),
  importance: z.number().int().min(1).max(5).default(3),
  isPinned: z.boolean().default(false),
}).strict();
export const memoryListSchema = z.object({
  type: z.enum(memoryTypes).optional(),
  take: z.number().int().min(1).max(100).default(100),
}).strict();
export const retrievalSchema = z.object({ limit: z.number().int().min(1).max(50).default(30) }).strict();
export type MemoryInput = z.infer<typeof memorySchema>;
export type MemoryResult = { ok: boolean; message: string; errors?: Record<string, string> };
