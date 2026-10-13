import { z } from "zod";

export const openaiVoiceIds = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"] as const;
export const qwenVoiceIds = ["qwen:Cherry", "qwen:Serena", "qwen:Ethan", "qwen:Chelsie", "qwen:Kai", "qwen:Maia"] as const;
export const aitunnelVoiceIds = ["qwen-flash:loongjohn", "qwen-flash:longanhuan_v3.6"] as const;
export const geminiVoiceIds = ["gemini:Zephyr", "gemini:Puck", "gemini:Charon", "gemini:Kore", "gemini:Fenrir", "gemini:Leda", "gemini:Orus", "gemini:Aoede", "gemini:Callirrhoe", "gemini:Autonoe", "gemini:Enceladus", "gemini:Iapetus", "gemini:Umbriel", "gemini:Algieba", "gemini:Despina", "gemini:Erinome", "gemini:Algenib", "gemini:Rasalgethi", "gemini:Laomedeia", "gemini:Achernar", "gemini:Alnilam", "gemini:Schedar", "gemini:Gacrux", "gemini:Pulcherrima", "gemini:Achird", "gemini:Zubenelgenubi", "gemini:Vindemiatrix", "gemini:Sadachbia", "gemini:Sadaltager", "gemini:Sulafat"] as const;
export const gemini31VoiceIds = geminiVoiceIds.map(id => `gemini31:${id.slice(7)}` as `gemini31:${typeof geminiVoiceIds[number] extends `gemini:${infer Voice}` ? Voice : never}`);
export const voiceIds = [...openaiVoiceIds, ...qwenVoiceIds, ...aitunnelVoiceIds, ...geminiVoiceIds, ...gemini31VoiceIds] as const;
export function isQwenVoice(id: string) { return id.startsWith("qwen:"); }
// Short translations of Google's published descriptions of the prebuilt voices.
export const geminiVoiceDescriptions: Record<string, string> = {
  Zephyr: "светлый", Puck: "жизнерадостный", Charon: "рассказчик", Kore: "уверенный",
  Fenrir: "эмоциональный", Leda: "молодой", Orus: "уверенный", Aoede: "лёгкий",
  Callirrhoe: "непринуждённый", Autonoe: "светлый", Enceladus: "с придыханием", Iapetus: "чёткий",
  Umbriel: "непринуждённый", Algieba: "плавный", Despina: "плавный", Erinome: "чёткий",
  Algenib: "хрипловатый", Rasalgethi: "рассказчик", Laomedeia: "жизнерадостный", Achernar: "мягкий",
  Alnilam: "уверенный", Schedar: "ровный", Gacrux: "зрелый", Pulcherrima: "выразительный",
  Achird: "дружелюбный", Zubenelgenubi: "разговорный", Vindemiatrix: "нежный",
  Sadachbia: "живой", Sadaltager: "осведомлённый", Sulafat: "тёплый",
};
export function voiceLabel(id: string) {
  if (id.startsWith("gemini:") || id.startsWith("gemini31:")) {
    const name = id.slice(id.indexOf(":") + 1);
    return `${name} — ${geminiVoiceDescriptions[name]}`;
  }
  const labels: Record<string, string> = {
    "qwen-flash:loongjohn": "Loongjohn — мужской", "qwen-flash:longanhuan_v3.6": "Longanhuan — женский",
    "qwen:Cherry": "Cherry — дружелюбный женский", "qwen:Serena": "Serena — мягкий женский",
    "qwen:Ethan": "Ethan — энергичный мужской", "qwen:Chelsie": "Chelsie — голос виртуальной героини",
    "qwen:Kai": "Kai — спокойный мужской", "qwen:Maia": "Maia — мягкий женский",
  };
  return labels[id] || id[0].toUpperCase() + id.slice(1);
}
export const voiceStyles = ["Естественная", "Тёплая", "Спокойная", "Энергичная", "Деловая"] as const;
export const voiceDefaults = { voiceId: "coral" as const, speed: "1" as const, style: "Естественная" as const, instructions: "" };
export const voiceSchema = z.object({
  voiceId: z.enum(voiceIds), speed: z.enum(["0.85", "1", "1.15"]), style: z.enum(voiceStyles),
  instructions: z.string().trim().max(1000, "Не более 1000 символов."),
  ageTone: z.enum(["original", "young", "older"]).optional(),
}).strict();
export type VoiceSettings = z.infer<typeof voiceSchema>;
export const voiceDeliverySchema = voiceSchema.pick({ speed: true, style: true, instructions: true, ageTone: true });
export type VoiceDelivery = z.infer<typeof voiceDeliverySchema>;
export function resolveVoiceDelivery(defaults: VoiceSettings, override: unknown): VoiceSettings {
  const parsed = voiceDeliverySchema.safeParse(override);
  return parsed.success ? { ...defaults, ...parsed.data } : defaults;
}
export const voicePreviewSchema = z.object({ settings: voiceSchema, text: z.string().trim().min(1).max(600), requestId: z.uuid() }).strict();
export function readVoice(value: unknown): VoiceSettings {
  const result = voiceSchema.safeParse(value);
  return result.success ? result.data : { ...voiceDefaults };
}
