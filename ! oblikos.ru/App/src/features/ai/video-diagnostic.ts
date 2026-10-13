import "server-only";
import type { VideoDiagnostic } from "./video-types";

// Only selected error fields enter server logs. Never log the request or raw
// response, which can echo signed URLs, credentials, prompts or media bytes.
export async function videoDiagnostic(response: Response, request: unknown, key: string): Promise<VideoDiagnostic> {
  const result: VideoDiagnostic = { status: response.status };
  const privateStrings = [key];
  function collect(value: unknown) {
    if (typeof value === "string" && value.length > 12) {
      privateStrings.push(value);
      privateStrings.push(...value.split(/[\n.!?]+/).filter(part => part.trim().length > 12).map(part => part.trim()));
    } else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  }
  collect(request);
  function clean(value: unknown, limit: number) {
    if (typeof value !== "string") return undefined;
    let text = value;
    for (const secret of privateStrings.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.split(secret).join("[redacted]");
    return text.replace(/data:[^\s"'<>]+/gi, "[media]")
      .replace(/https?:\/\/[^\s"'<>]+/gi, "[url]")
      .replace(/Bearer\s+\S+|\bsk-[\w-]+/gi, "[credential]")
      .replace(/[A-Za-z0-9+/=_-]{64,}/g, "[data]")
      .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit);
  }
  result.requestId = clean(response.headers.get("x-request-id") || response.headers.get("request-id"), 160);
  const reader = response.body?.getReader();
  if (!reader) return result;
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > 32768) return result;
      chunks.push(part.value);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const error = parsed?.error;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      result.providerCode = clean(error.code || error.type, 120);
      result.parameter = clean(error.param, 160);
      result.message = clean(error.message, 800);
    } else result.message = clean(typeof error === "string" ? error : parsed?.message, 800);
  } catch { /* Diagnostics must not change the original error classification. */ }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return result;
}
