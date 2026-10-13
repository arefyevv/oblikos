"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { talkingVideos, videos } from "./video-service";
import { MediaArchived, MediaUnavailable } from "./operations";
import { VideoError } from "@/features/ai/video-types";
import type { VideoGenerationView } from "./video-validation";
import { GenerationSafetyError, generationSafetyMessages } from "@/features/ai/safety";
type Result = { ok: true; generation: VideoGenerationView } | { ok: false; message: string };
function failure(e: unknown): Extract<Result, { ok: false }> {
  unstable_rethrow(e);
  if (e instanceof GenerationSafetyError) return { ok: false, message: generationSafetyMessages[e.code] };
  if (e instanceof VideoError || e instanceof MediaArchived) return { ok: false, message: e.message };
  if (e instanceof z.ZodError) return { ok: false, message: "Проверьте параметры видео." };
  if (e instanceof MediaUnavailable) return { ok: false, message: "Видео или персонаж недоступен." };
  console.error("Video action failed", e instanceof Error ? e.name : "UnknownError");
  return { ok: false, message: "Ответ не получен. Проверьте медиатеку перед новой попыткой." };
}
function invalidate(g: VideoGenerationView) {
  revalidatePath("/animation");
  revalidatePath("/dashboard"); revalidatePath("/media"); revalidatePath(`/characters/${g.characterId}`, "layout");
}
export async function createVideoAction(input: unknown, requestId: string): Promise<Result> {
  try {
    const generation = await videos.create(input, requestId);
    invalidate(generation);
    return { ok: true, generation };
  } catch (e) { return failure(e); }
}
export async function videoStatusAction(id: string): Promise<Result> {
  try { const generation = await videos.status(id); if (generation.status === "READY") invalidate(generation); return { ok: true, generation }; } catch (e) { return failure(e); }
}
export async function videoActivityAction(knownIds: string[]): Promise<{ ok: true; generations: VideoGenerationView[] } | { ok: false; message: string }> {
  try { return { ok: true, generations: await videos.activity(knownIds) }; }
  catch (error) { return failure(error); }
}
export async function createTalkingVideoAction(input: unknown, requestId: string): Promise<Result> {
  try { const generation = await talkingVideos.create(input, requestId); invalidate(generation); return { ok: true, generation }; }
  catch (error) { return failure(error); }
}
