import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { ProxySpeechProvider } from "../src/features/voice/provider";
import { voiceDefaults } from "../src/features/voice/validation";

const marker = "artifacts/aitunnel-voice-live-20261006.json";
await writeFile(marker, JSON.stringify({ phase: "started", calls: 1 }), { flag: "wx" });
try {
  const bytes = await new ProxySpeechProvider().synthesize(
    { ...voiceDefaults, voiceId: "qwen-flash:loongjohn" },
    "Привет! Это проверка русского голоса через Qwen Flash.",
  );
  await writeFile("artifacts/aitunnel-voice-live-20261006.mp3", bytes);
  await writeFile(marker, JSON.stringify({ phase: "saved", calls: 1, bytes: bytes.length }));
  console.log("AITUNNEL: MP3 saved", bytes.length);
} catch (error) {
  await writeFile(marker, JSON.stringify({ phase: "failed", calls: 1, error: error instanceof Error ? error.message : "unknown" }));
  console.log("AITUNNEL failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
}
