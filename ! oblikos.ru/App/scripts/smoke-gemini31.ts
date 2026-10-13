import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { ProxySpeechProvider } from "../src/features/voice/provider";
import { voiceDefaults } from "../src/features/voice/validation";

for (const demo of [{ name: "slow-calm", speed: "0.85", style: "Спокойная" }, { name: "fast-lively", speed: "1.15", style: "Энергичная" }] as const) {
  const prefix = `artifacts/gemini31-${demo.name}-20261006`;
  await writeFile(`${prefix}.json`, JSON.stringify({ phase: "started", calls: 1 }), { flag: "wx" });
  try {
    const bytes = await new ProxySpeechProvider().synthesize(
      { ...voiceDefaults, voiceId: "gemini31:Kore", speed: demo.speed, style: demo.style },
      "Привет! Я Дарья. Сегодня расскажу, как найти свой стиль и чувствовать себя увереннее.",
    );
    await writeFile(`${prefix}.wav`, bytes);
    const report = { phase: "saved", calls: 1, seconds: (bytes.length - 44) / 48000 };
    await writeFile(`${prefix}.json`, JSON.stringify(report));
    console.log(demo.name, JSON.stringify(report));
  } catch (error) {
    await writeFile(`${prefix}.json`, JSON.stringify({ phase: "failed", calls: 1 }));
    console.log(demo.name, error instanceof Error ? error.message : "failed");
    process.exitCode = 1;
  }
}
