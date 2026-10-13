import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { FalMotionProvider, falResultUrl, motionModel } from "../src/features/ai/motion-provider";
import { VideoError } from "../src/features/ai/video-types";
import { billedDuration, performancePrice } from "../src/features/media/performance-cost";
import { performanceRequestSchema } from "../src/features/media/performance-validation";
import { inspectSource } from "../src/features/media/source-file";
import { identitySchema } from "../src/features/characters/validation";
import { AitunnelMotionProvider } from "../src/features/ai/aitunnel-motion-provider";
import { savedMotionProvider } from "../src/features/ai/performance-provider";
import { buildPerformancePrompt } from "../src/features/media/performance-prompt";
import { restoreOriginalVideoSound } from "../src/features/media/original-video-sound";
import { inspectVideo } from "../src/features/media/video-file";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

test("Seedance Mini uses 720p video+image, separate square pricing and preserves legacy job routing", async () => {
  const names = ["AITUNNEL_API_KEY", "MOTION_VIDEO_MODEL", "MOTION_VIDEO_PROVIDER", "SEEDANCE_PRICE_RUB_PER_SECOND", "SEEDANCE_SQUARE_PRICE_RUB_PER_SECOND"];
  const previous = names.map(name => process.env[name]);
  process.env.AITUNNEL_API_KEY = "offline-mini-key"; process.env.MOTION_VIDEO_PROVIDER = "aitunnel"; process.env.MOTION_VIDEO_MODEL = "seedance-2.0-mini";
  process.env.SEEDANCE_PRICE_RUB_PER_SECOND = "12.852"; process.env.SEEDANCE_SQUARE_PRICE_RUB_PER_SECOND = "7.22925";
  let posts = 0, fail = false;
  const transport = mock.method(globalThis, "fetch", async (raw: unknown, init?: RequestInit) => {
    assert.equal(String(raw), "https://api.aitunnel.ru/v1/videos");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer offline-mini-key");
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body)); posts++;
    assert.equal(body.model, "seedance-2.0-mini"); assert.equal(body.duration, 4); assert.equal(body.size, "720x1280");
    assert.equal(body.input_references[0].video_url.url, "data:video/mp4;base64,dmlkZW8=");
    assert.equal(body.input_references[1].image_url.url, "data:image/png;base64,aW1hZ2U=");
    assert.equal(body.generate_audio, true); assert.equal(body.keep_audio, undefined);
    return Response.json({ id: "offline-mini", status: "pending" }, { status: fail ? 500 : 202 });
  });
  try {
    const provider = new AitunnelMotionProvider();
    assert.equal(provider.configuration().model, "seedance-2.0-mini");
    assert.equal((await provider.capabilities()).durations[0], 4);
    assert.equal(billedDuration("PERFORMANCE", 4.03, "video"), 5);
    assert.throws(() => billedDuration("PERFORMANCE", 3.99, "video"), VideoError);
    assert.deepEqual(performancePrice("PERFORMANCE", 5), { amount: 64.26, currency: "RUB" });
    assert.equal(performancePrice("PERFORMANCE", 15).amount, 192.78);
    assert.equal(performancePrice("PERFORMANCE", 15, "1:1").amount, 108.4388);
    delete process.env.SEEDANCE_SQUARE_PRICE_RUB_PER_SECOND; assert.throws(() => performancePrice("PERFORMANCE", 5, "1:1"), VideoError);
    assert.equal(savedMotionProvider("aitunnel-motion", "hailuo-3")?.configuration().model, "hailuo-3");
    assert.equal(savedMotionProvider("aitunnel-motion", "seedance-2.0-mini")?.configuration().model, "seedance-2.0-mini");
    const input = { prompt: "Transfer all three kittens", duration: 4, aspectRatio: "9:16", reference: { bytes: Buffer.from("image"), mimeType: "image/png" }, performance: { bytes: Buffer.from("video"), mimeType: "video/mp4", orientation: "video" as const, keepOriginalSound: true } };
    assert.equal((await provider.createVideo(input)).id, "offline-mini");
    await assert.rejects(provider.createVideo({ ...input, duration: 3 }), VideoError); assert.equal(posts, 1);
    fail = true; await assert.rejects(provider.createVideo(input), (e: unknown) => e instanceof VideoError && e.code === "ambiguous"); assert.equal(posts, 2);
  } finally { transport.mock.restore(); names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; }); }
});

test("reference validation rejects foreign URL input, incompatible audio parameters and fake containers", async () => {
  const input = { characterId: randomUUID(), referenceAssetId: randomUUID(), sourceId: randomUUID(), mode: "AUDIO", aspectRatio: "9:16" };
  assert.ok(performanceRequestSchema.safeParse(input).success);
  assert.equal(performanceRequestSchema.safeParse({ ...input, url: "http://127.0.0.1" }).success, false);
  assert.equal(performanceRequestSchema.safeParse({ ...input, keepOriginalSound: false }).success, false);
  assert.equal(performanceRequestSchema.safeParse({ ...input, orientation: "image" }).success, false);
  for (const kind of ["AUDIO", "VIDEO"] as const) await assert.rejects(inspectSource(Buffer.from("<html>not media</html>"), kind));
  await assert.rejects(inspectSource(Buffer.alloc(10 * 1024 * 1024 + 1), "AUDIO"));
  const source = await inspectSource(await readFile(new URL("./fixtures/avatar.mp4", import.meta.url)), "VIDEO");
  assert.equal(source.hasAudio, true); assert.ok(source.duration > 4 && source.duration < 5);
  // Locally authored PCM fixture; no external media, voices or paid calls.
  const wav = Buffer.alloc(44 + 16000 * 2); wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  const audio = await inspectSource(wav, "AUDIO"); assert.equal(audio.duration, 1); assert.equal(audio.extension, "wav");
});
test("cost fails closed and enforces audio buckets and motion orientation limits", () => {
  process.env.MOTION_VIDEO_PROVIDER = "fal";
  const original = process.env.MOTION_PRICE_USD_PER_SECOND;
  try {
    delete process.env.MOTION_PRICE_USD_PER_SECOND; assert.throws(() => performancePrice("PERFORMANCE", 5), VideoError);
    process.env.MOTION_PRICE_USD_PER_SECOND = "0.1234";
    assert.equal(performancePrice("PERFORMANCE", 5).amount, 0.617);
    assert.equal(billedDuration("AUDIO", 4.03, "video"), 5);
    assert.equal(billedDuration("AUDIO", 15.1, "video"), 20);
    assert.throws(() => billedDuration("AUDIO", 60.1, "video"), VideoError);
    assert.throws(() => billedDuration("PERFORMANCE", 11, "image"), VideoError);
    assert.throws(() => billedDuration("PERFORMANCE", 2, "video"), VideoError);
    assert.equal(billedDuration("PERFORMANCE", 29.5, "video"), 30);
  } finally { delete process.env.MOTION_VIDEO_PROVIDER; if (original === undefined) delete process.env.MOTION_PRICE_USD_PER_SECOND; else process.env.MOTION_PRICE_USD_PER_SECOND = original; }
});
test("nonhuman identity is backwards compatible and does not require human demographics", () => {
  const identity = { name: "Кот", gender: "", ageRange: "", niche: "Развлечения", biography: "" };
  assert.ok(identitySchema.safeParse({ ...identity, kind: "ANIMAL" }).success);
  assert.ok(identitySchema.safeParse({ ...identity, kind: "FANTASY" }).success);
  assert.equal(identitySchema.safeParse(identity).success, false);
  assert.equal(identitySchema.parse({ ...identity, gender: "Мужской", ageRange: "25–34" }).kind, "HUMAN");
});
test("fal wire uses documented performance inputs, no POST retry, and a restricted credential-free download", async () => {
  const original = process.env.FAL_KEY; process.env.FAL_KEY = "offline-fal-key";
  let failed = false, http = 200, posts = 0, state = "IN_QUEUE", malicious = false;
  const transport = mock.method(globalThis, "fetch", async (raw: unknown, init?: RequestInit) => {
    const url = String(raw);
    assert.equal(init?.redirect, "error");
    if (url.startsWith("https://v3b.fal.media/")) { assert.equal(init?.headers, undefined); return new Response(Buffer.from("container")); }
    assert.equal((init?.headers as Record<string, string>).Authorization, "Key offline-fal-key");
    if (init?.method === "POST") {
      posts++; assert.equal(url, `https://queue.fal.run/${motionModel}`);
      const body = JSON.parse(String(init.body)); assert.equal(body.character_orientation, "video"); assert.equal(body.keep_original_sound, true); assert.equal(body.video_url, "data:video/mp4;base64,dmlkZW8="); assert.equal(body.audio_url, undefined);
      return Response.json({ request_id: "offline-motion", status_url: "https://evil.example" }, { status: http });
    }
    assert.ok(url.startsWith("https://queue.fal.run/fal-ai/kling-video/requests/offline-motion"));
    if (url.endsWith("/status")) return Response.json({ status: state, ...(failed ? { error: "upstream failure" } : {}) });
    return Response.json({ video: { url: malicious ? "http://127.0.0.1/private" : "https://v3b.fal.media/files/result.mp4" } });
  });
  const input = { prompt: "Transfer motion", duration: 5, aspectRatio: "9:16", reference: { bytes: Buffer.from("image"), mimeType: "image/png" }, performance: { bytes: Buffer.from("video"), mimeType: "video/mp4", orientation: "video" as const, keepOriginalSound: true } };
  try {
    const provider = new FalMotionProvider(); assert.equal((await provider.createVideo(input)).status, "PENDING");
    assert.equal((await provider.getVideoStatus("offline-motion")).status, "PENDING");
    state = "IN_PROGRESS"; assert.equal((await provider.getVideoStatus("offline-motion")).status, "PROCESSING");
    state = "COMPLETED"; assert.equal((await provider.getVideoStatus("offline-motion")).status, "READY");
    failed = true; assert.equal((await provider.getVideoStatus("offline-motion")).status, "FAILED"); failed = false;
    assert.equal((await provider.downloadVideo("offline-motion")).bytes.toString(), "container");
    malicious = true; await assert.rejects(provider.downloadVideo("offline-motion"));
    http = 500; const count = posts; await assert.rejects(provider.createVideo(input), (error: unknown) => error instanceof VideoError && error.code === "ambiguous"); assert.equal(posts, count + 1);
    await assert.rejects(provider.createVideo({ ...input, audio: { bytes: Buffer.from("audio"), mimeType: "audio/wav" } }), VideoError);
    for (const url of ["https://fal.media.evil.example/a", "https://user:pass@fal.media/a", "https://fal.media:444/a", "http://fal.media/a", "https://127.0.0.1/a"]) assert.throws(() => falResultUrl(url));
  } finally { transport.mock.restore(); if (original === undefined) delete process.env.FAL_KEY; else process.env.FAL_KEY = original; }
});

test("AITUNNEL motion defaults to RUB, rejects incompatible controls and keeps legacy job routing", () => {
  const original = { engine: process.env.MOTION_VIDEO_PROVIDER, price: process.env.MOTION_PRICE_RUB_PER_SECOND };
  try {
    delete process.env.MOTION_VIDEO_PROVIDER; delete process.env.MOTION_PRICE_RUB_PER_SECOND;
    assert.throws(() => performancePrice("PERFORMANCE", 7), VideoError);
    process.env.MOTION_PRICE_RUB_PER_SECOND = "22.1";
    assert.deepEqual(performancePrice("PERFORMANCE", 7), { amount: 154.7, currency: "RUB" });
    assert.equal(billedDuration("PERFORMANCE", 6.0272, "video"), 7);
    for (const seconds of [4.9, 15.1, 30]) assert.throws(() => billedDuration("PERFORMANCE", seconds, "video"), VideoError);
    assert.throws(() => billedDuration("PERFORMANCE", 6, "image"), VideoError);
    assert.ok(savedMotionProvider("aitunnel-motion", "hailuo-3") instanceof AitunnelMotionProvider);
    assert.ok(savedMotionProvider("fal-motion", motionModel) instanceof FalMotionProvider);
    assert.equal(savedMotionProvider("aitunnel-motion", "unreviewed-model"), undefined);
  } finally {
    for (const [key, value] of [["MOTION_VIDEO_PROVIDER", original.engine], ["MOTION_PRICE_RUB_PER_SECOND", original.price]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("Hailuo sends video+image, exact 2K size and duration; uses fixed-host status/download and never retries POST", async () => {
  const key = process.env.AITUNNEL_API_KEY; process.env.AITUNNEL_API_KEY = "offline-aitunnel-key";
  const video = await readFile(new URL("./fixtures/video.mp4", import.meta.url));
  // Alter only the authored MP4 track header to exercise the 2K size guard.
  const large = Buffer.from(video), tkhd = large.indexOf("tkhd"), end = tkhd - 4 + large.readUInt32BE(tkhd - 4);
  large.writeUInt32BE(2560 * 65536, end - 8); large.writeUInt32BE(1440 * 65536, end - 4);
  let posts = 0, fail = false, status = "pending";
  const transport = mock.method(globalThis, "fetch", async (raw: unknown, init?: RequestInit) => {
    const url = String(raw);
    assert.ok(url.startsWith("https://api.aitunnel.ru/v1/videos"));
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer offline-aitunnel-key");
    assert.equal(init?.redirect, "error");
    if (init?.method === "POST") {
      posts++; const body = JSON.parse(String(init.body));
      assert.equal(body.model, "hailuo-3"); assert.equal(body.size, "2560x1440"); assert.equal(body.duration, 7); assert.equal(body.generate_audio, true);
      assert.equal(body.input_references[0].video_url.url, "data:video/mp4;base64,dmlkZW8=");
      assert.equal(body.input_references[1].image_url.url, "data:image/png;base64,aW1hZ2U=");
      for (const name of ["frame_images", "character_orientation", "keep_original_sound", "audio_url"]) assert.equal(body[name], undefined);
      return Response.json({ id: "offline-hailuo", status: "pending", polling_url: "https://evil.example" }, { status: fail ? 500 : 202 });
    }
    if (url.endsWith("/content?index=0")) return new Response(large, { headers: { "content-type": "application/octet-stream" } });
    assert.equal(url, "https://api.aitunnel.ru/v1/videos/offline-hailuo");
    return Response.json({ id: "offline-hailuo", status, unsigned_urls: ["https://evil.example"] });
  });
  const input = { prompt: "Match gestures", duration: 7, aspectRatio: "16:9", reference: { bytes: Buffer.from("image"), mimeType: "image/png" }, performance: { bytes: Buffer.from("video"), mimeType: "video/mp4", orientation: "video" as const, keepOriginalSound: false } };
  try {
    const provider = new AitunnelMotionProvider(); assert.equal((await provider.createVideo(input)).id, "offline-hailuo");
    assert.equal((await provider.getVideoStatus("offline-hailuo")).status, "PENDING"); status = "completed";
    assert.equal((await provider.getVideoStatus("offline-hailuo")).status, "READY");
    assert.equal((await provider.downloadVideo("offline-hailuo")).bytes.length, large.length);
    const before = posts;
    await provider.createVideo({ ...input, performance: { ...input.performance, keepOriginalSound: true } });
    await assert.rejects(provider.createVideo({ ...input, duration: 16 }), VideoError);
    assert.equal(posts, before + 1);
    fail = true; await assert.rejects(provider.createVideo(input), (e: unknown) => e instanceof VideoError && e.code === "ambiguous"); assert.equal(posts, before + 2);
  } finally { transport.mock.restore(); if (key === undefined) delete process.env.AITUNNEL_API_KEY; else process.env.AITUNNEL_API_KEY = key; }
});

test("group direction retains every image character, role mapping and species without human profile conflicts", () => {
  const base = { characterId: randomUUID(), referenceAssetId: randomUUID(), sourceId: randomUUID(), mode: "PERFORMANCE", aspectRatio: "9:16", cast: "GROUP", roles: "Left kitten = left dancer; cream kitten = center dancer; right kitten = right dancer." };
  const input = performanceRequestSchema.parse(base), prompt = buildPerformancePrompt(input, { name: "Unrelated human profile" });
  assert.ok(prompt.includes("ALL the characters")); assert.ok(prompt.includes(input.roles!));
  assert.ok(!prompt.includes("One character")); assert.ok(!prompt.includes("Unrelated human profile"));
  assert.equal(performanceRequestSchema.safeParse({ ...base, roles: " " }).success, false);
  assert.equal(performanceRequestSchema.safeParse({ ...base, mode: "AUDIO" }).success, false);
  assert.equal(performanceRequestSchema.safeParse({ ...base, cast: "SINGLE" }).success, false);
});

test("original song replaces generated sound with unchanged AAC samples and original duration", async () => {
  const source = await readFile(new URL("./fixtures/avatar.mp4", import.meta.url)), video = await readFile(new URL("./fixtures/video.mp4", import.meta.url));
  const duration = inspectVideo(source, "video/mp4").duration;
  const output = await restoreOriginalVideoSound(video, source, duration);
  const metadata = inspectVideo(output, "video/mp4");
  assert.ok(Math.abs(metadata.duration - duration) < 0.12);
  assert.equal(metadata.width, inspectVideo(video, "video/mp4").width);
  const directory = await mkdtemp(path.join(tmpdir(), "oblikos-audio-test-"));
  try {
    const original = path.join(directory, "original.mp4"), result = path.join(directory, "result.mp4");
    await Promise.all([writeFile(original, source), writeFile(result, output)]);
    const execute = promisify(execFile);
    const audio = async (file: string) => (await execute(ffmpeg!, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:a:0", "-c:a", "copy", "-f", "adts", "pipe:1"], { encoding: "buffer", timeout: 10000, maxBuffer: 5 * 1024 * 1024, windowsHide: true })).stdout;
    assert.deepEqual(await audio(result), await audio(original));
    await assert.rejects(restoreOriginalVideoSound(source, video, inspectVideo(video, "video/mp4").duration), VideoError);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("original sound accepts bounded H.264 B-frame container drift without changing audio samples", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "oblikos-bframe-test-"));
  const execute = promisify(execFile);
  try {
    const generated = path.join(directory, "generated.mp4"), sourcePath = path.join(directory, "source.mp4"), result = path.join(directory, "result.mp4");
    await execute(ffmpeg!, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", "tests/fixtures/video.mp4", "-t", "5.1", "-r", "24", "-c:v", "libx264", "-bf", "3", "-pix_fmt", "yuv420p", "-c:a", "aac", generated], { timeout: 30000, windowsHide: true });
    const source = await readFile(new URL("./fixtures/avatar.mp4", import.meta.url)), duration = inspectVideo(source, "video/mp4").duration;
    const bytes = await restoreOriginalVideoSound(await readFile(generated), source, duration);
    const drift = inspectVideo(bytes, "video/mp4").duration - duration;
    assert.ok(drift > 0.12 && drift <= 0.25, `Expected bounded B-frame drift, got ${drift}`);
    await Promise.all([writeFile(sourcePath, source), writeFile(result, bytes)]);
    const audio = async (file: string) => (await execute(ffmpeg!, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:a:0", "-c:a", "copy", "-f", "adts", "pipe:1"], { encoding: "buffer", timeout: 10000, maxBuffer: 5 * 1024 * 1024, windowsHide: true })).stdout;
    assert.deepEqual(await audio(result), await audio(sourcePath));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
