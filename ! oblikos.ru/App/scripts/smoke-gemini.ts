import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { ProxySpeechProvider } from "../src/features/voice/provider";
import { voiceDefaults } from "../src/features/voice/validation";

const marker = "artifacts/gemini-integration-live-20261006.json";
await writeFile(marker, JSON.stringify({ phase: "started", calls: 1 }), { flag: "wx" });
try {
  const bytes = await new ProxySpeechProvider().synthesize(
    { ...voiceDefaults, voiceId: "gemini:Kore" }, "Привет! Я Дарья. Рада тебя видеть.",
  );
  await writeFile("artifacts/gemini-integration-live-20261006.wav", bytes);
  await writeFile(marker, JSON.stringify({ phase: "saved", calls: 1, bytes: bytes.length }));
  console.log("Gemini WAV saved", bytes.length);
} catch (error) {
  await writeFile(marker, JSON.stringify({ phase: "failed", calls: 1, error: error instanceof Error ? error.message : "unknown" }));
  console.log("Gemini failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
}
