import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { AitunnelAvatarProvider } from "../src/features/ai/avatar-provider";
import { VideoError } from "../src/features/ai/video-types";
import { readFile } from "node:fs/promises";
import { parseBuffer } from "music-metadata";
import { inspectVideo } from "../src/features/media/video-file";

test("Avatar wire: photo and audio, fixed download origin, terminal statuses and no paid retries", async () => {
  const original = process.env.AITUNNEL_API_KEY; process.env.AITUNNEL_API_KEY = "offline-avatar-key";
  let http = 202, malformed = false, status = "pending", contentType = "video/mp4", badDownload = false;
  const bytes = await readFile(new URL("./fixtures/avatar.mp4", import.meta.url));
  const transport = mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    assert.ok(String(url).startsWith("https://api.aitunnel.ru/v1/videos")); assert.equal(init.redirect, "error");
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.model, "avatar-iv"); assert.equal(body.duration, 5); assert.equal(body.generate_audio, undefined);
      assert.deepEqual(body.input_references.map((entry: { type: string }) => entry.type), ["image_url", "audio_url"]);
      assert.equal(body.input_references[1].audio_url.url, "data:audio/wav;base64,YXVkaW8=");
      return Response.json(malformed ? {} : { id: "offline-avatar", status: "pending" }, { status: http });
    }
    if (String(url).endsWith("/content?index=0")) return new Response(badDownload ? Buffer.from("<html>upstream error</html>") : bytes, { headers: { "content-type": contentType } });
    return Response.json({ id: "offline-avatar", status, polling_url: "https://evil.example", unsigned_urls: ["https://evil.example"] });
  });
  const input = { prompt: "Natural portrait speaking Russian", duration: 5, aspectRatio: "9:16", reference: { bytes: Buffer.from("image"), mimeType: "image/jpeg" }, audio: { bytes: Buffer.from("audio"), mimeType: "audio/wav" } };
  try {
    const provider = new AitunnelAvatarProvider();
    assert.equal((await provider.createVideo(input)).status, "PENDING");
    for (const state of ["failed", "cancelled", "expired"]) { status = state; assert.equal((await provider.getVideoStatus("offline-avatar")).status, "FAILED"); }
    status = "completed"; assert.equal((await provider.getVideoStatus("offline-avatar")).status, "READY");
    assert.deepEqual((await provider.downloadVideo("offline-avatar")).bytes, bytes);
    for (const type of ["application/octet-stream", "binary/octet-stream"]) {
      contentType = type;
      const count = transport.mock.callCount();
      const file = await provider.downloadVideo("offline-avatar");
      assert.equal(file.mimeType, "video/mp4"); assert.deepEqual(file.bytes, bytes);
      assert.equal(transport.mock.callCount(), count + 1);
      badDownload = true;
      await assert.rejects(provider.downloadVideo("offline-avatar"), VideoError);
      badDownload = false;
    }
    contentType = "text/html"; await assert.rejects(provider.downloadVideo("offline-avatar"), VideoError);
    contentType = "video/mp4";
    assert.ok(inspectVideo(bytes, "video/mp4", 61).duration > 4);
    const metadata = await parseBuffer(bytes, { mimeType: "video/mp4" }); assert.equal(metadata.format.hasAudio, true); assert.equal(metadata.format.hasVideo, true);
    malformed = true; await assert.rejects(provider.createVideo(input), (error: unknown) => error instanceof VideoError && error.code === "ambiguous");
    malformed = false;
    for (const [code, expected] of [[402, "balance"], [401, "configuration"], [500, "ambiguous"]] as const) {
      http = code; const count = transport.mock.callCount(); await assert.rejects(provider.createVideo(input), (error: unknown) => error instanceof VideoError && error.code === expected); assert.equal(transport.mock.callCount(), count + 1);
    }
  } finally { transport.mock.restore(); if (original === undefined) delete process.env.AITUNNEL_API_KEY; else process.env.AITUNNEL_API_KEY = original; }
});
