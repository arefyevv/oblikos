import { gemini31VoiceIds } from "./validation";

// Gender labels from Google's Gemini-TTS voice table; unrelated to character identity.
// https://docs.cloud.google.com/text-to-speech/docs/gemini-tts#voice_options
const female = new Set(["Achernar", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Gacrux", "Kore", "Laomedeia", "Leda", "Pulcherrima", "Sulafat", "Vindemiatrix", "Zephyr"]);
export function voiceGender(id: string): "female" | "male" {
  return female.has(id.slice(id.indexOf(":") + 1)) ? "female" : "male";
}
export function voicesByGender(gender: "female" | "male") {
  return gemini31VoiceIds.filter(id => voiceGender(id) === gender);
}
