import "server-only";
import { isQwenVoice, voiceSchema, type VoiceSettings } from "./validation";

export class SpeechError extends Error {
  constructor(public code: "configuration" | "aitunnelConfiguration" | "qwenConfiguration" | "qwenInstructions" | "balance" | "provider" | "response" | "pending" | "unavailable") { super(code); }
}
export const speechMessages = {
  aitunnelConfiguration: "AITUNNEL пока не настроен. Проверьте серверный API-ключ.",
  configuration: "Озвучка пока не настроена. Обратитесь к администратору.",
  qwenConfiguration: "Qwen пока не подключён. Администратору нужно настроить API-ключ Alibaba Cloud для региона Singapore.",
  qwenInstructions: "Для Qwen напишите пожелания к озвучке на английском или оставьте поле пустым. Текст пробы остаётся русским.",
  balance: "Недостаточно средств для озвучки.",
  provider: "Не удалось получить озвучку. Новую попытку можно запустить отдельно.",
  response: "Сервис вернул неподходящий аудиофайл.",
  pending: "Озвучка ещё обрабатывается. Повторите проверку этого запроса чуть позже.",
  unavailable: "Этот образец недоступен. Запустите новую пробу.",
};
export const maxSpeechBytes = 2 * 1024 * 1024;
export class ProxySpeechProvider {
  async synthesize(settings: VoiceSettings, text: string): Promise<Buffer> {
    voiceSchema.parse(settings);
    if (settings.voiceId.startsWith("qwen-flash:") || settings.voiceId.startsWith("gemini:") || settings.voiceId.startsWith("gemini31:")) return new AitunnelSpeechProvider().synthesize(settings, text);
    if (isQwenVoice(settings.voiceId)) return new QwenSpeechProvider().synthesize(settings, text);
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new SpeechError("configuration");
    let response: Response;
    try {
      response = await fetch("https://api.proxyapi.ru/v1/audio/speech", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-4o-mini-tts", input: text, voice: settings.voiceId,
          speed: Number(settings.speed), response_format: "mp3",
          instructions: `Говори по-русски. Манера речи: ${settings.style}. ${settings.instructions}` }),
        signal: AbortSignal.timeout(60000), redirect: "error", cache: "no-store",
      });
    } catch { throw new SpeechError("provider"); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SpeechError(response.status === 402 ? "balance" : [401, 403].includes(response.status) ? "configuration" : "provider");
    }
    if (!response.body || Number(response.headers.get("content-length")) > maxSpeechBytes || !/^audio\/(mpeg|mp3)(;|$)/i.test(response.headers.get("content-type") || "")) {
      await response.body?.cancel(); throw new SpeechError("response");
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > maxSpeechBytes) { await reader.cancel(); throw new SpeechError("response"); }
        chunks.push(part.value);
      }
    } catch (error) { if (error instanceof SpeechError) throw error; throw new SpeechError("provider"); }
    finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (bytes.length < 4 || !(bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224))) throw new SpeechError("response");
    return bytes;
  }
}

export function speechContentType(bytes: Buffer): "audio/wav" | "audio/mpeg" {
  if (bytes.length >= 44 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") return "audio/wav";
  if (bytes.length >= 4 && (bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224))) return "audio/mpeg";
  throw new SpeechError("response");
}

export class AitunnelSpeechProvider {
  async synthesize(settings: VoiceSettings, text: string): Promise<Buffer> {
    voiceSchema.parse(settings);
    const gemini31 = settings.voiceId.startsWith("gemini31:");
    const gemini = gemini31 || settings.voiceId.startsWith("gemini:");
    if (!gemini && !settings.voiceId.startsWith("qwen-flash:")) throw new SpeechError("configuration");
    const key = process.env.AITUNNEL_API_KEY?.trim();
    if (!key) throw new SpeechError("aitunnelConfiguration");
    try {
      const response = await fetch("https://api.aitunnel.ru/v1/audio/speech", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(gemini ? {
          model: gemini31 ? "gemini-3.1-flash-tts-preview" : "gemini-3.8-flash-lite-tts",
          voice: settings.voiceId.slice(gemini31 ? 9 : 7), input: gemini31 ? gemini31SpeechText(settings, text) : text, response_format: "pcm",
        } : { model: "qwen-audio-3.0-tts-flash", voice: settings.voiceId.slice(11), input: text, response_format: "mp3" }),
        signal: AbortSignal.timeout(60000), redirect: "error", cache: "no-store",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new SpeechError(response.status === 402 ? "balance" : [401, 403].includes(response.status) ? "aitunnelConfiguration" : "provider");
      }
      const contentType = response.headers.get("content-type") || "";
      if (!(gemini ? /^audio\/(pcm|l16|wav|x-wav)(;|$)/i : /^audio\/(mpeg|mp3)(;|$)/i).test(contentType)) {
        await response.body?.cancel(); throw new SpeechError("response");
      }
      const bytes = await readBounded(response, gemini ? 8 * 1024 * 1024 : maxSpeechBytes);
      if (gemini) return pcmToWav(bytes, contentType);
      if (speechContentType(bytes) !== "audio/mpeg") throw new SpeechError("response");
      return bytes;
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      throw new SpeechError("provider");
    }
  }
}

export function gemini31SpeechText(settings: VoiceSettings, text: string): string {
  const styles: Record<VoiceSettings["style"], string> = {
    "Естественная": "natural conversational delivery", "Тёплая": "warm and friendly delivery",
    "Спокойная": "calm and relaxed delivery", "Энергичная": "energetic and lively delivery", "Деловая": "professional and composed delivery",
  };
  const pace = settings.speed === "0.85" ? "slow pace, with unhurried pauses" : settings.speed === "1.15" ? "fast, brisk pace" : "normal conversational pace";
  const age = settings.ageTone === "young" ? " Use a youthful adult vocal delivery." : settings.ageTone === "older" ? " Use an older, mature adult vocal delivery." : "";
  return `Read only the TRANSCRIPT aloud in Russian. Do not read the director's notes.\nDIRECTOR'S NOTES\nDelivery: ${styles[settings.style]}. Pace: ${pace}.${age}\nAdditional direction: ${settings.instructions || "none"}\nTRANSCRIPT\n${text}`;
}

export function pcmToWav(bytes: Buffer, contentType: string): Buffer {
  if (bytes.length >= 44 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") return bytes;
  if (!bytes.length || bytes.length % 2) throw new SpeechError("response");
  const rate = Number(contentType.match(/rate=(\d+)/i)?.[1] || 24000);
  if (rate !== 24000) throw new SpeechError("response");
  const header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(bytes.length + 36, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(bytes.length, 40);
  return Buffer.concat([header, bytes]);
}

async function readBounded(response: Response, limit: number): Promise<Buffer> {
  if (!response.body || Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel(); throw new SpeechError("response");
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit) { await reader.cancel(); throw new SpeechError("response"); }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

export class QwenSpeechProvider {
  async synthesize(settings: VoiceSettings, text: string): Promise<Buffer> {
    voiceSchema.parse(settings);
    if (!isQwenVoice(settings.voiceId)) throw new SpeechError("configuration");
    const key = process.env.DASHSCOPE_API_KEY?.trim();
    if (!key) throw new SpeechError("qwenConfiguration");
    if (/[а-яё]/i.test(settings.instructions)) throw new SpeechError("qwenInstructions");
    const styles: Record<VoiceSettings["style"], string> = {
      "Естественная": "Natural conversational delivery", "Тёплая": "Warm and friendly delivery",
      "Спокойная": "Calm and relaxed delivery", "Энергичная": "Energetic and lively delivery", "Деловая": "Professional and composed delivery",
    };
    const pace = settings.speed === "0.85" ? "Speak slowly" : settings.speed === "1.15" ? "Speak briskly" : "Use a normal conversational pace";
    const signal = AbortSignal.timeout(60000);
    try {
      const response = await fetch("https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "qwen3-tts-instruct-flash-2026-01-26", input: {
          text, voice: settings.voiceId.slice(5), language_type: "Russian",
          instructions: `Speak Russian fluently, with natural pauses and intonation. ${styles[settings.style]}. ${pace}. ${settings.instructions}`,
          optimize_instructions: true,
        } }), signal, redirect: "error", cache: "no-store",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new SpeechError(response.status === 402 ? "balance" : [401, 403].includes(response.status) ? "qwenConfiguration" : "provider");
      }
      let data: { code?: string; output?: { audio?: { url?: string } } };
      try { data = JSON.parse((await readBounded(response, 65536)).toString("utf8")); }
      catch { throw new SpeechError("response"); }
      if (data.code) throw new SpeechError(/balance|arrearage/i.test(data.code) ? "balance" : "provider");
      if (typeof data.output?.audio?.url !== "string") throw new SpeechError("response");
      const url = new URL(data.output.audio.url);
      // Only fetch signed Alibaba result objects; never send the API key to storage.
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port ||
        !/^dashscope-result-[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname)) throw new SpeechError("response");
      url.protocol = "https:";
      const audio = await fetch(url, { signal, redirect: "error", cache: "no-store" });
      if (!audio.ok) { await audio.body?.cancel(); throw new SpeechError("response"); }
      const bytes = await readBounded(audio, 8 * 1024 * 1024);
      speechContentType(bytes);
      return bytes;
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      throw new SpeechError("provider");
    }
  }
}
