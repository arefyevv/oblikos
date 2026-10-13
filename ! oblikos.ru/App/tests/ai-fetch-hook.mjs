// Loaded explicitly into isolated E2E server processes via NODE_OPTIONS.
// No test-provider switch or fake API path exists in the production application.
const originalFetch = globalThis.fetch;
import sharp from "sharp";
import { readFile } from "node:fs/promises";
process.env.OPENAI_API_KEY = "e2e-test-key";
process.env.DASHSCOPE_API_KEY = "e2e-qwen-key";
process.env.AITUNNEL_API_KEY = "e2e-aitunnel-key";
process.env.FAL_KEY = "e2e-fal-key";
process.env.AVATAR_PRICE_RUB_PER_SECOND = "8.5";
process.env.MOTION_PRICE_USD_PER_SECOND = "0.1";
process.env.MOTION_VIDEO_PROVIDER = "aitunnel";
process.env.MOTION_VIDEO_MODEL = "seedance-2.0-mini";
process.env.SEEDANCE_PRICE_RUB_PER_SECOND = "12.852";
process.env.SEEDANCE_SQUARE_PRICE_RUB_PER_SECOND = "7.22925";
process.env.MOTION_PRICE_RUB_PER_SECOND = "22.1";
process.env.REFERENCE_VIDEO_WORKER_ENABLED = "true";
process.env.OPENAI_MODEL = "e2e-test-model";
process.env.OPENAI_IMAGE_MODEL = "e2e-image-model";
process.env.OPENAI_IMAGE_REFERENCE_SUPPORTED = "true";
process.env.OPENAI_VIDEO_MODEL = "kwaivgi/kling-v3.0-pro";
process.env.VIDEO_GENERATION_ENABLED = "true";
process.env.AI_VIDEO_PER_MINUTE = "100";
process.env.AI_VIDEO_PER_DAY = "500";
process.env.AI_VIDEO_GLOBAL_PER_DAY = "5000";
// Explicit value prevents Next's later .env loading from restoring ProxyAPI.
process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
let sequence = 0;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === "https://queue.fal.run/fal-ai/kling-video/v3/pro/motion-control" && init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    if (!body.image_url?.startsWith("data:image/") || !body.video_url?.startsWith("data:video/mp4;base64,")) throw new Error("Missing performance fixtures");
    return Response.json({ request_id: `offline-motion-${Date.now()}` });
  }
  if (url.startsWith("https://queue.fal.run/")) throw new Error("fal is offline in browser tests");
  if (/^https:\/\/[^/]*fal\.media\//.test(url)) throw new Error("fal CDN is offline in browser tests");
  if (url === "https://api.aitunnel.ru/v1/audio/speech") {
    const body = JSON.parse(String(init?.body));
    if (body.model !== "gemini-3.1-flash-tts-preview" || body.voice !== "Kore" || !body.input.includes("TRANSCRIPT")) throw new Error("Unexpected talking speech fixture");
    return new Response(await readFile(new URL("../public/media/voice-samples/gemini31-kore-fast.wav", import.meta.url)), { headers: { "content-type": "audio/wav" } });
  }
  if (url === "https://api.aitunnel.ru/v1/videos" && init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    if (body.model === "seedance-2.0-mini") {
      if (!body.input_references?.[0]?.video_url?.url.startsWith("data:video/mp4;base64,") || !body.input_references?.[1]?.image_url?.url.startsWith("data:image/") || body.size !== "720x1280") throw new Error("Missing Seedance performance fixtures");
      return Response.json({ id: `offline-motion-${Date.now()}`, status: "pending" }, { status: 202 });
    }
    if (body.model === "hailuo-3") {
      if (!body.input_references?.[0]?.video_url?.url.startsWith("data:video/mp4;base64,") || !body.input_references?.[1]?.image_url?.url.startsWith("data:image/") || body.size !== "1440x2560") throw new Error("Missing Hailuo performance fixtures");
      return Response.json({ id: `offline-motion-${Date.now()}`, status: "pending" }, { status: 202 });
    }
    if (body.model !== "avatar-iv" || body.input_references?.[0]?.type !== "image_url" || !body.input_references?.[1]?.audio_url?.url.startsWith("data:audio/wav;base64,")) throw new Error("Missing portrait or speech");
    return Response.json({ id: `offline-avatar-${Date.now()}`, status: "pending" }, { status: 202 });
  }
  if (url.startsWith("https://api.aitunnel.ru/v1/videos/")) {
    const id = new URL(url).pathname.split("/")[3];
    if (!/^offline-avatar-\d+$/.test(id)) throw new Error("Unexpected avatar job fixture");
    if (url.includes("/content")) return new Response(await readFile(new URL("./fixtures/avatar.mp4", import.meta.url)), { headers: { "content-type": "video/mp4" } });
    return Response.json({ id, status: Date.now() - Number(id.split("-")[2]) > 6000 ? "completed" : "pending" });
  }
  if (url.startsWith("https://api.aitunnel.ru/")) throw new Error("AITUNNEL is offline in browser tests");
  if (url === "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation") {
    const body = JSON.parse(String(init?.body));
    if (body.model !== "qwen3-tts-instruct-flash-2026-01-26" || body.input?.language_type !== "Russian" || !body.input?.voice || !body.input?.text) throw new Error("Invalid Qwen fixture request");
    return Response.json({ output: { audio: { url: "https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/e2e.wav" } } });
  }
  if (url === "https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/e2e.wav") {
    const wav = Buffer.alloc(44 + 24000 * 2 * 2);
    wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
    return new Response(wav, { headers: { "Content-Type": "audio/wav" } });
  }
  if (url === "https://api.proxyapi.ru/v1/audio/speech") {
    const body = JSON.parse(String(init?.body));
    if (body.model !== "openai/gpt-4o-mini-tts" || !body.voice || !body.input || body.response_format !== "mp3") throw new Error("Invalid speech fixture request");
    return new Response(await readFile(new URL("./fixtures/voice.mp3", import.meta.url)), { headers: { "Content-Type": "audio/mpeg" } });
  }
  if (url.startsWith("https://api.proxyapi.ru/v1beta/")) {
    const pathname = new URL(url).pathname;
    if (pathname === "/v1beta/models") return Response.json({ models: [{ name: "models/veo-3.1-fast-generate-preview", supportedGenerationMethods: ["predictLongRunning"] }] });
    if (pathname.endsWith(":predictLongRunning")) {
      const body = JSON.parse(String(init?.body));
      if (!body.instances?.[0]?.image?.bytesBase64Encoded || !body.instances[0].image.mimeType || body.parameters.sampleCount !== 1) throw new Error("Missing Google first frame or unexpected count");
      return Response.json({ name: `models/veo-3.1-fast-generate-preview/operations/offline-${Date.now()}-ready` });
    }
    if (pathname === "/v1beta/files/e2evideo1:download") return new Response(await readFile(new URL("./fixtures/video.mp4", import.meta.url)), { headers: { "content-type": "video/mp4" } });
    const id = pathname.split("/operations/")[1];
    if (!/^offline-\d+-(ready|failed)$/.test(id || "")) throw new Error("Unexpected Google operation in E2E");
    const done = id.endsWith("-failed") || Date.now() - Number(id.split("-")[1]) > 6000;
    return Response.json({ name: `models/veo-3.1-fast-generate-preview/operations/${id}`, done, ...(id.endsWith("-failed") ? { error: { code: 13 } } : done ? { response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/e2evideo1:download", mimeType: "video/mp4" } }] } } } : {}) });
  }
  if (!url.startsWith("https://api.openai.com/")) return originalFetch(input, init);
  if (url === "https://api.openai.com/v1/videos/models") return Response.json({ data: [{ id: "kwaivgi/kling-v3.0-pro", supported_frame_images: ["first_frame", "last_frame"], supported_durations: [3, 4, 6, 8], supported_aspect_ratios: ["16:9", "9:16", "1:1"], supported_resolutions: ["720p"] }] });
  if (url === "https://api.openai.com/v1/videos" && init?.method === "POST") {
    const body = JSON.parse(String(init.body)), frame = body.frame_images?.[0];
    if (body.model !== "kwaivgi/kling-v3.0-pro" || frame?.frame_type !== "first_frame" || frame.type !== "image_url" || !/^data:image\/(png|jpeg|webp);base64,/.test(frame.image_url?.url || "") || body.generate_audio !== false) throw new Error("Missing Kling first frame or unexpected parameters");
    return Response.json({ id: `offline-${Date.now()}-ready`, status: "pending" }, { status: 202 });
  }
  if (url.startsWith("https://api.openai.com/v1/videos/")) {
    const id = decodeURIComponent(new URL(url).pathname.split("/")[3]);
    if (!/^offline-\d+-(ready|failed)$/.test(id)) throw new Error("Unexpected video job in E2E");
    if (url.endsWith("/content")) return new Response(await readFile(new URL("./fixtures/video.mp4", import.meta.url)), { headers: { "content-type": "video/mp4" } });
    const started = Number(id.split("-")[1]);
    return new Response(JSON.stringify({ id, status: id.endsWith("-failed") ? "failed" : Date.now() - started > 6000 ? "completed" : "processing" }), { headers: { "content-type": "application/json" } });
  }
  if (url === "https://api.openai.com/v1/images/generations" || url === "https://api.openai.com/v1/images/edits") {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const bytes = await sharp({ create: { width: 600, height: 800, channels: 3, background: ++sequence % 2 ? "#d3c1aa" : "#b8c2cd" } }).png().toBuffer();
    return new Response(JSON.stringify({ data: [{ b64_json: bytes.toString("base64") }] }), { headers: { "content-type": "application/json" } });
  }
  if (url !== "https://api.openai.com/v1/responses") throw new Error("Unexpected OpenAI call in E2E");
  const data = JSON.parse(String(init?.body));
  if (data.text?.format?.name === "character_appearance") {
    const images = data.input[1].content.filter((item) => item.type === "input_image");
    if (!images.length || images.length > 10 || images.some((image) => !image.image_url.startsWith("data:image/jpeg;base64,"))) throw new Error("Invalid character photo inputs");
    const text = JSON.stringify({ hairColor: "Каштановые", hairStyle: "Волнистое каре", clothingStyle: "Минимализм", visualDescription: `Персонаж с овальным лицом и короткими каштановыми волосами. Учтено фото: ${images.length}.`, additionalInstructions: "Сохранять форму лица и причёску." });
    return Response.json({ id: "resp_photo_test", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }] });
  }
  const context = JSON.parse(data.input[1].content.split("\n").slice(1).join("\n"));
  if (!context.IDENTITY.name || !context.MEMORY.length) throw new Error("Missing character or memory context");
  await new Promise((resolve) => setTimeout(resolve, 350));
  const text = `Тестовый текст ${++sequence} от ${context.IDENTITY.name}. ${context.MEMORY.map((m) => `[${m.type}] ${m.content}`).join(" ")}`;
  return new Response(JSON.stringify({ id: `resp_test_${sequence}`, object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }] }), { status: 200, headers: { "content-type": "application/json" } });
};
