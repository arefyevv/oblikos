import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { videoDiagnostic } from "../src/features/ai/video-diagnostic";
import { AitunnelMotionProvider } from "../src/features/ai/aitunnel-motion-provider";
import { VideoError } from "../src/features/ai/video-types";

test("Video diagnostics preserve API cause and redact credentials, media, signed URLs and prompts", async () => {
  const key = "private-diagnostic-key", prompt = "Private kittens instruction", url = "https://app.example/input?token=secret";
  const response = Response.json({ error: { code: "invalid_parameter", param: "input_references", message: `Unsupported combination. ${key} ${prompt} ${url} data:image/png;base64,abcdef Bearer other-key sk-secret-token` }, input_references: ["must never be logged"] }, { status: 400, headers: { "x-request-id": "request-123" } });
  const diagnostic = await videoDiagnostic(response, { prompt, input_references: [{ url }] }, key);
  assert.equal(diagnostic.status, 400); assert.equal(diagnostic.requestId, "request-123");
  assert.equal(diagnostic.providerCode, "invalid_parameter"); assert.equal(diagnostic.parameter, "input_references");
  assert.match(diagnostic.message!, /Unsupported combination/);
  for (const secret of [key, prompt, url, "abcdef", "other-key", "sk-secret-token", "must never be logged"]) assert.ok(!JSON.stringify(diagnostic).includes(secret));
});

test("Malformed and oversized provider errors cannot replace the HTTP failure", async () => {
  assert.deepEqual(await videoDiagnostic(new Response("not JSON", { status: 400 }), {}, "key"), { status: 400, requestId: undefined });
  const large = Response.json({ error: { message: "x".repeat(40000) } }, { status: 500 });
  const diagnostic = await videoDiagnostic(large, {}, "key");
  assert.equal(diagnostic.status, 500); assert.equal(diagnostic.message, undefined);
});

test("Seedance HTTP 400 carries private diagnostics without retrying the paid POST", async () => {
  const oldKey = process.env.AITUNNEL_API_KEY; process.env.AITUNNEL_API_KEY = "offline-diagnostic-key";
  let posts = 0;
  const transport = mock.method(globalThis, "fetch", async () => {
    posts++; return Response.json({ error: { code: "invalid_parameter", param: "input_references", message: "Reference combination rejected" } }, { status: 400, headers: { "x-request-id": "offline-123" } });
  });
  try {
    await assert.rejects(new AitunnelMotionProvider("seedance-2.0-mini").createVideo({ prompt: "Offline test", duration: 5, aspectRatio: "9:16", reference: { bytes: Buffer.from("image"), mimeType: "image/png" }, performance: { bytes: Buffer.from("video"), mimeType: "video/mp4", orientation: "video", keepOriginalSound: true } }), (error: unknown) => {
      assert.ok(error instanceof VideoError); assert.equal(error.code, "invalid");
      assert.equal(error.diagnostic?.requestId, "offline-123"); assert.equal(error.diagnostic?.parameter, "input_references");
      assert.ok(!error.message.includes("Reference combination")); return true;
    });
    assert.equal(posts, 1);
  } finally { transport.mock.restore(); if (oldKey === undefined) delete process.env.AITUNNEL_API_KEY; else process.env.AITUNNEL_API_KEY = oldKey; }
});
