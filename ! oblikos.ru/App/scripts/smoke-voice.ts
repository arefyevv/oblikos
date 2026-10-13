import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { ProxySpeechProvider } from "../src/features/voice/provider";
import { voiceDefaults } from "../src/features/voice/validation";
// Exclusive marker before the only paid call. Do not automatically rerun.
const marker = process.env.VOICE_SMOKE_MARKER || "artifacts/voice-live-20261006.json";
await writeFile(marker, JSON.stringify({ phase: "started", model: "openai/gpt-4o-mini-tts", calls: 1 }), { flag: "wx" });
try {
  const bytes = await new ProxySpeechProvider().synthesize(voiceDefaults, "Привет! Я цифровой персонаж. Теперь у меня есть свой голос, и я готова вести блог.");
  await writeFile("artifacts/voice-live-20261006.mp3", bytes);
  await writeFile(marker, JSON.stringify({ phase: "saved", model: "openai/gpt-4o-mini-tts", voice: "coral", calls: 1, bytes: bytes.length }));
  console.log("Voice smoke: MP3 saved", bytes.length);
} catch (error) {
  await writeFile(marker, JSON.stringify({ phase: "failed", calls: 1, error: error instanceof Error ? error.message : "unknown" }));
  throw error;
}
