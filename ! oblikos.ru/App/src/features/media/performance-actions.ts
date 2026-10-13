"use server";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { performanceVideos } from "./performance-service";
import { VideoError } from "@/features/ai/video-types";
import type { PerformanceQuote } from "./performance-validation";
function message(error: unknown) { unstable_rethrow(error); return error instanceof VideoError ? error.message : "Не удалось выполнить действие. Проверьте исходники и доступ к персонажу."; }
export async function quotePerformanceAction(input: unknown): Promise<{ ok: true; quote: PerformanceQuote } | { ok: false; message: string }> {
  try { return { ok: true, quote: await performanceVideos.quote(input) }; } catch (error) { return { ok: false, message: message(error) }; }
}
export async function enqueuePerformanceAction(input: unknown, requestId: string, quote: unknown) {
  try {
    const generation = await performanceVideos.enqueue(input, requestId, quote);
    revalidatePath("/animation"); revalidatePath("/content/new"); revalidatePath("/media"); revalidatePath(`/characters/${generation.characterId}/media`);
    return { ok: true as const, id: generation.id, status: generation.status, retryable: generation.status === "FAILED" && !["ambiguous", "deadline"].includes(generation.errorCode || "") };
  } catch (error) { return { ok: false as const, message: message(error) }; }
}
