"use server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { GenerationSafetyError, generationSafetyMessages } from "@/features/ai/safety";
import { SpeechError, speechMessages } from "./provider";
import { voice } from "./service";
export async function previewVoiceAction(input: unknown): Promise<{ ok: true; url: string } | { ok: false; message: string; retry: boolean }> {
  try { const result = await voice.preview(input); return { ok: true, url: `/api/voice/${result.id}` }; }
  catch (error) {
    unstable_rethrow(error);
    const message = error instanceof GenerationSafetyError ? generationSafetyMessages[error.code] : error instanceof SpeechError ? speechMessages[error.code] : error instanceof z.ZodError ? "Проверьте настройки и текст (до 600 символов)." : "Не удалось получить образец голоса.";
    return { ok: false, message, retry: !(error instanceof SpeechError && error.code === "pending") };
  }
}
