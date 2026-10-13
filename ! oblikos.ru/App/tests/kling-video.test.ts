import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { ProxyAPIVideoProvider } from "../src/features/ai/video-provider";
import { encodeKlingPrimaryImage } from "../src/features/ai/kling-reference";
import { VideoError } from "../src/features/ai/video-types";

test("Kling wire sends the exact private portrait as first frame; failed create never retries", async () => {
  const original = { ...process.env };
  process.env.OPENAI_API_KEY = "offline-kling-key";
  process.env.OPENAI_BASE_URL = "https://api.proxyapi.ru/v1";
  process.env.OPENAI_VIDEO_MODEL = "kwaivgi/kling-v3.0-pro";
  const reference = { bytes: Buffer.from([0, 1, 200, 255]), mimeType: "image/png" };
  let posts = 0, fail = false;
  const transport = mock.method(globalThis, "fetch", async (input: unknown, init: RequestInit) => {
    const url = String(input);
    assert.equal(init.redirect, "error");
    if (url.endsWith("/models")) return Response.json({ data: [{ id: process.env.OPENAI_VIDEO_MODEL, supported_frame_images: ["first_frame"], supported_resolutions: ["720p"], supported_durations: [3, 4, 6, 8, 15], supported_aspect_ratios: ["16:9", "9:16", "1:1"] }] });
    assert.equal(url, "https://api.proxyapi.ru/v1/videos");
    assert.equal(init.method, "POST"); posts++;
    const body = JSON.parse(String(init.body));
    assert.deepEqual(body.frame_images, [{ type: "image_url", frame_type: "first_frame", image_url: { url: `data:image/png;base64,${reference.bytes.toString("base64")}` } }]);
    assert.equal(body.generate_audio, false); assert.equal(body.resolution, "720p"); assert.equal(body.duration, 4);
    return Response.json(fail ? {} : { id: "offline-kling-job", status: "pending" }, { status: fail ? 503 : 202 });
  });
  try {
    const provider = new ProxyAPIVideoProvider(encodeKlingPrimaryImage, ["kwaivgi/kling-v3.0-pro"]);
    assert.deepEqual((await provider.capabilities()).durations, [3, 4, 6, 8]);
    const input = { prompt: "Natural portrait motion", duration: 4, aspectRatio: "16:9", reference };
    assert.equal((await provider.createVideo(input)).status, "PENDING");
    fail = true; await assert.rejects(provider.createVideo(input), VideoError); assert.equal(posts, 2);
    await assert.rejects(provider.createVideo({ ...input, duration: 15 }), VideoError); assert.equal(posts, 2);
    process.env.OPENAI_VIDEO_MODEL = "google/veo-3.1-fast";
    assert.throws(() => provider.configuration(), VideoError);
    assert.throws(() => encodeKlingPrimaryImage({ ...reference, mimeType: "text/html" }), VideoError);
    assert.throws(() => encodeKlingPrimaryImage({ ...reference, bytes: Buffer.alloc(0) }), VideoError);
  } finally {
    transport.mock.restore();
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
