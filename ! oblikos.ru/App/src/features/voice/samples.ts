import { generatedVoiceSamples } from "./generated-samples";

export const voiceSamples: Record<string, { label: string; url: string }[]> = {
  ...generatedVoiceSamples,
  "gemini31:Kore": [
    { label: "Медленно и спокойно", url: "/media/voice-samples/gemini31-kore-slow.wav" },
    { label: "Быстро и энергично", url: "/media/voice-samples/gemini31-kore-fast.wav" },
  ],
  "gemini:Kore": [{ label: "Обычная подача", url: "/media/voice-samples/gemini-kore.wav" }],
};
