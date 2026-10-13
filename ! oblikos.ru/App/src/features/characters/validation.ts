import { z } from "zod";
import { voiceSchema, voiceDefaults } from "@/features/voice/validation";

export const genders = ["Женский", "Мужской"] as const;
export const characterKinds = ["HUMAN", "ANIMAL", "FANTASY"] as const;
export const maxTraits = 7;
export const ages = ["18–24", "25–34", "35–44", "45–54", "55+"] as const;
export const niches = ["Мода и красота", "Здоровье и фитнес", "Путешествия", "Бизнес", "Финансы", "Технологии", "Образование", "Еда", "Lifestyle", "Развлечения"] as const;
export const communicationStyles = ["Дружелюбный", "Экспертный", "Спокойный", "Энергичный", "Юмор и ирония", "Провокационный", "Вдохновляющий", "Деловой"] as const;
export const tones = ["Нейтральный", "Тёплый", "Сдержанный", "Неформальный"] as const;
export const traitOptions = ["Уверенный", "Любознательный", "Эмпатичный", "Прямолинейный", "Оптимистичный", "Рациональный", "Творческий", "Амбициозный"] as const;
export const hairColors = ["Чёрные", "Тёмные", "Каштановые", "Русые", "Светлые", "Рыжие", "Седые"] as const;
export const hairStyles = ["Короткая", "Каре", "Средней длины", "Длинная", "Кудрявая"] as const;
export const clothingStyles = ["Минимализм", "Casual", "Business", "Streetwear", "Sport", "Luxury", "Elegant", "Creative"] as const;

const text = (limit: number) => z.string().trim().max(limit, `Не более ${limit} символов.`);
export const identitySchema = z.object({
  kind: z.enum(characterKinds).default("HUMAN"),
  name: text(120).min(1, "Введите имя персонажа."),
  gender: z.union([z.enum(genders), z.literal("")]),
  ageRange: z.union([z.enum(ages), z.literal("")]),
  niche: text(160).min(1, "Укажите нишу персонажа."),
  biography: text(5000),
}).strict().superRefine((identity, ctx) => {
  if (identity.kind === "HUMAN" && !identity.gender) ctx.addIssue({ code: "custom", path: ["gender"], message: "Выберите пол." });
  if (identity.kind === "HUMAN" && !identity.ageRange) ctx.addIssue({ code: "custom", path: ["ageRange"], message: "Выберите возраст." });
});
export const appearanceSchema = z.object({
  hairColor: text(120),
  hairStyle: text(160),
  clothingStyle: text(160),
  visualDescription: text(5000),
  additionalInstructions: text(5000),
}).strict();
export const personalitySchema = z.object({
  communicationStyle: z.enum(communicationStyles, { error: "Выберите стиль общения." }),
  tone: text(160),
  traits: z.array(z.enum(traitOptions)).max(maxTraits, "Выберите не более 7 черт характера.").refine((items) => new Set(items).size === items.length, "Черты не должны повторяться."),
  description: text(5000),
  additionalInstructions: text(5000),
}).strict();
export const characterSchema = z.object({
  identity: identitySchema,
  appearance: appearanceSchema,
  personality: personalitySchema,
  voice: voiceSchema.default(voiceDefaults),
}).strict();
export const sectionSchemas = { identity: identitySchema, appearance: appearanceSchema, personality: personalitySchema, voice: voiceSchema };
export type CharacterInput = z.infer<typeof characterSchema>;
export type CharacterFormData = Omit<CharacterInput, "identity"> & {
  identity: Omit<CharacterInput["identity"], "gender" | "ageRange"> & {
    gender: CharacterInput["identity"]["gender"] | "";
    ageRange: CharacterInput["identity"]["ageRange"] | "";
  };
};
export type CharacterSection = keyof typeof sectionSchemas;
export type FieldErrors = Record<string, string>;
export type CharacterResult = { ok: boolean; message: string; id?: string; errors?: FieldErrors };

export function validationErrors(error: z.ZodError): FieldErrors {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.filter((part) => typeof part !== "number").join("."), issue.message]));
}
export const emptyCharacter: CharacterFormData = {
  voice: { ...voiceDefaults },
  identity: { kind: "HUMAN", name: "", gender: "", ageRange: "", niche: "", biography: "" },
  appearance: { hairColor: "", hairStyle: "", clothingStyle: "", visualDescription: "", additionalInstructions: "" },
  personality: { communicationStyle: "Дружелюбный", tone: "", traits: [], description: "", additionalInstructions: "" },
};
