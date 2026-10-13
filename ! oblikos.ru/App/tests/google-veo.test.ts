import "dotenv/config";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ProxyAPIGoogleVeoProvider, encodeGooglePrimaryImage, nativeVideoModel, NativeVideoHTTPError } from "../src/features/ai/google-veo-provider";
import { VideoError } from "../src/features/ai/video-types";

test("official Google SDK wire: native base/model, first frame, operation, polling and protected SDK download", async () => {
  const original = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_VIDEO_MODEL };
  process.env.OPENAI_API_KEY = "offline-google-key"; process.env.OPENAI_VIDEO_MODEL = "google/veo-3.1-fast";
  const name = "models/veo-3.1-fast-generate-preview/operations/job1";
  const image = Buffer.from([0, 1, 2, 200, 255]), bytes = await readFile("tests/fixtures/video.mp4");
  const calls: { url: string; method: string; body?: unknown }[] = [];
  let done = false, failed = false, createStatus = 200, timeout = false, unsafeURI = false;
  const transport = mock.method(globalThis, "fetch", async (input: unknown, init: RequestInit) => {
    const url = String(input), method = init.method || "GET";
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    assert.equal(new URL(url).origin, "https://api.proxyapi.ru");
    assert.ok(new URL(url).pathname.startsWith("/v1beta/"));
    assert.ok(!new URL(url).pathname.includes("/google/"));
    assert.equal(init.redirect, "error"); assert.equal(new Headers(init.headers).get("x-goog-api-key"), "offline-google-key");
    if (url.includes("/models?") || url.endsWith("/models")) return Response.json({ models: [{ name: "models/veo-3.1-fast-generate-preview", supportedGenerationMethods: ["predictLongRunning"] }] });
    if (method === "POST") {
      if (timeout) throw new DOMException("Offline timeout", "TimeoutError");
      return Response.json(createStatus === 200 ? { name } : { error: { message: "Do not expose sensitive provider errors" } }, { status: createStatus });
    }
    if (url.includes("/files/")) { assert.equal(url, "https://api.proxyapi.ru/v1beta/files/video1:download?alt=media"); return new Response(bytes, { headers: { "content-type": "video/mp4", "content-length": String(bytes.length) } }); }
    assert.equal(url, `https://api.proxyapi.ru/v1beta/${name}`);
    return Response.json({ name, done, ...(failed ? { error: { code: 13, message: "Sensitive failure" } } : done ? { response: { generateVideoResponse: { generatedSamples: [{ video: { uri: unsafeURI ? "https://evil.example/v1beta/files/video1" : "https://generativelanguage.googleapis.com/v1beta/files/video1:download?alt=media", mimeType: "video/mp4" } }] } } } : {}) });
  });
  try {
    const provider = new ProxyAPIGoogleVeoProvider();
    assert.equal(nativeVideoModel("google/veo-3.1-fast"), "veo-3.1-fast-generate-preview");
    assert.equal(nativeVideoModel("google/veo-3.1"), "veo-3.1-generate-preview");
    assert.equal(nativeVideoModel("google/veo-3.1-lite"), "veo-3.1-lite-generate-preview");
    assert.throws(() => nativeVideoModel("google/unknown"), VideoError);
    assert.deepEqual(encodeGooglePrimaryImage({ bytes: image, mimeType: "image/png" }), { imageBytes: image.toString("base64"), mimeType: "image/png" });
    assert.throws(() => encodeGooglePrimaryImage({ bytes: Buffer.alloc(0), mimeType: "image/png" }), VideoError);
    assert.deepEqual(await provider.capabilities(), { referenceImages: true, durations: [4, 6, 8], aspectRatios: ["16:9", "9:16"] });
    assert.equal(new URL(calls[0].url).pathname, "/v1beta/models");
    const input = { prompt: "Character turns toward camera", duration: 4, aspectRatio: "16:9", reference: { bytes: image, mimeType: "image/png" } };
    const job = await provider.createVideo(input);
    assert.deepEqual(job, { id: name, status: "PROCESSING" });
    assert.deepEqual(calls.find(c => c.method === "POST"), {
      url: "https://api.proxyapi.ru/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning", method: "POST",
      body: { instances: [{ prompt: input.prompt, image: { bytesBase64Encoded: image.toString("base64"), mimeType: "image/png" } }], parameters: { sampleCount: 1, durationSeconds: 4, aspectRatio: "16:9", resolution: "720p" } },
    });
    assert.equal((await provider.getVideoStatus(name)).status, "PROCESSING"); done = true;
    assert.equal((await provider.getVideoStatus(name)).status, "READY");
    assert.deepEqual((await provider.downloadVideo(name)).bytes, bytes);
    const downloadCount = calls.filter(c => c.url.includes("/files/")).length;
    unsafeURI = true; await assert.rejects(provider.downloadVideo(name), VideoError);
    assert.equal(calls.filter(c => c.url.includes("/files/")).length, downloadCount); unsafeURI = false;
    failed = true; assert.equal((await provider.getVideoStatus(name)).status, "FAILED"); failed = false;
    for (const status of [400, 402, 403, 404, 503]) {
      createStatus = status; const before = calls.filter(c => c.method === "POST").length;
      await assert.rejects(provider.createVideo(input), (error: unknown) => error instanceof NativeVideoHTTPError && error.httpStatus === status);
      assert.equal(calls.filter(c => c.method === "POST").length, before + 1);
    }
    timeout = true; const before = calls.filter(c => c.method === "POST").length;
    await assert.rejects(provider.createVideo(input), (error: unknown) => error instanceof VideoError && error.code === "ambiguous");
    assert.equal(calls.filter(c => c.method === "POST").length, before + 1);
    const beforeInvalid = calls.length;
    await assert.rejects(provider.createVideo({ ...input, duration: 5 }), VideoError);
    await assert.rejects(provider.createVideo({ ...input, aspectRatio: "1:1" }), VideoError);
    await assert.rejects(provider.getVideoStatus("https://evil.example/job"), VideoError);
    assert.equal(calls.length, beforeInvalid);
  } finally {
    transport.mock.restore();
    for (const [env, value] of [["OPENAI_API_KEY", original.key], ["OPENAI_VIDEO_MODEL", original.model]]) {
      if (value === undefined) delete process.env[env!]; else process.env[env!] = value;
    }
  }
});
