import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { OpenAICompatibleImageProvider } from "../src/features/ai/image-provider";
import { ImageError } from "../src/features/ai/image-types";

test("Nano Banana native wire: exact aspect ratio, ten references, image response and safe failures without retries", async () => {
  const keys = ["OPENAI_API_KEY", "OPENAI_IMAGE_MODEL", "OPENAI_BASE_URL", "OPENAI_IMAGE_REFERENCE_SUPPORTED"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { OPENAI_API_KEY: "offline-test", OPENAI_IMAGE_MODEL: "google/gemini-3.1-flash-image", OPENAI_BASE_URL: "https://api.proxyapi.ru/v1", OPENAI_IMAGE_REFERENCE_SUPPORTED: "true" });
  const bytes = Buffer.from("offline-image-bytes");
  let status = 200, references = 0, malformed = false;
  const transport = mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    assert.equal(String(url), "https://api.proxyapi.ru/v1beta/models/gemini-3.1-flash-image:generateContent");
    assert.equal(init.redirect, "error");
    const body = JSON.parse(String(init.body));
    assert.deepEqual(body.generationConfig.responseModalities, ["IMAGE"]);
    assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: "4:5", imageSize: "1K" });
    const photos = body.contents[0].parts.filter((part: { inlineData?: unknown }) => part.inlineData);
    assert.equal(photos.length, references);
    for (const photo of photos) assert.deepEqual(photo.inlineData, { mimeType: "image/jpeg", data: bytes.toString("base64") });
    return new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: malformed ? [{ text: "No image" }] : [{ inlineData: { mimeType: "image/png", data: bytes.toString("base64") } }] } }] } : { error: { code: status, message: "private upstream error" } }), { status, headers: { "content-type": "application/json" } });
  });
  try {
    const provider = new OpenAICompatibleImageProvider();
    assert.equal(provider.capabilities().referenceImages, true);
    const result = await provider.generateImage({ prompt: "portrait", aspectRatio: "4:5" });
    assert.deepEqual(result.bytes, bytes); assert.equal(result.referenceUsed, false); assert.equal(result.model, "google/gemini-3.1-flash-image");
    references = 10;
    assert.equal((await provider.generateImage({ prompt: "portrait", aspectRatio: "4:5", referenceImages: Array.from({ length: 10 }, () => ({ bytes, mimeType: "image/jpeg" })) })).referenceUsed, true);
    references = 0; malformed = true;
    await assert.rejects(provider.generateImage({ prompt: "portrait", aspectRatio: "4:5" }), (error: unknown) => error instanceof ImageError && error.code === "response");
    malformed = false;
    for (const [http, code] of [[429, "rate_limit"], [401, "configuration"], [400, "provider"], [504, "timeout"]] as const) {
      status = http; const calls = transport.mock.callCount();
      await assert.rejects(provider.generateImage({ prompt: "portrait", aspectRatio: "4:5" }), (error: unknown) => error instanceof ImageError && error.code === code);
      assert.equal(transport.mock.callCount(), calls + 1);
    }
  } finally {
    transport.mock.restore();
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});
