import { sourceMaxBytes } from "@/features/media/source-file";
import { VideoError } from "@/features/ai/video-types";
import { GenerationSafetyError } from "@/features/ai/safety";
import { authEnvironment } from "@/features/auth/config";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(request: Request) {
  // Cookie-authenticated upload: reject cross-origin multipart submissions.
  // The request URL may contain the internal HTTP address behind the HTTPS proxy.
  if (request.headers.get("origin") !== authEnvironment().origin) return Response.json({ message: "Недопустимый источник запроса." }, { status: 403 });
  const maximum = sourceMaxBytes + 65536;
  if (!request.body || Number(request.headers.get("content-length")) > maximum) return Response.json({ message: "Файл слишком большой." }, { status: 413 });
  const { currentWorkspace } = await import("@/features/auth/access");
  try { await currentWorkspace(); } catch { return Response.json({ message: "Войдите в аккаунт." }, { status: 401 }); }
  const reader = request.body.getReader(); let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > maximum) { await reader.cancel(); return Response.json({ message: "Файл слишком большой." }, { status: 413 }); } chunks.push(part.value); }
    const form = await new Response(Buffer.concat(chunks, length), { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
    const characterId = z.uuid().parse(form.get("characterId")), kind = z.enum(["AUDIO", "VIDEO", "IMAGE"]).parse(form.get("kind"));
    const file = form.get("file"); if (!(file instanceof File) || !file.size) throw new VideoError("invalid");
    const { videoSources } = await import("@/features/media/source-service");
    const source = await videoSources.upload(characterId, kind, Buffer.from(await file.arrayBuffer()));
    return Response.json({ id: source.id, kind, duration: "duration" in source ? source.duration : null, hasAudio: "hasAudio" in source ? source.hasAudio : false, expiresAt: "expiresAt" in source ? source.expiresAt.toISOString() : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ message: error instanceof VideoError ? error.message : error instanceof GenerationSafetyError ? "Достигнут лимит загрузок. Попробуйте позже." : "Не удалось загрузить файл. Проверьте формат, длительность и доступ к персонажу." }, { status: 400 });
  } finally { reader.releaseLock(); }
}
