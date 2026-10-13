import "dotenv/config";
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import { getDatabase } from "../src/db/client";
import { createPerformanceService } from "../src/features/media/performance-operations";
import { createSourceService } from "../src/features/media/source-operations";
import { createVideoService } from "../src/features/media/video-operations";
import { createMediaService, MediaUnavailable } from "../src/features/media/operations";
import { LocalStorageProvider } from "../src/features/media/storage";
import { createCharacterService } from "../src/features/characters/operations";
import { emptyCharacter } from "../src/features/characters/validation";
import { FakeVideoProvider } from "./fake-video-provider";
import { FakeImageProvider } from "./fake-image-provider";
import { VideoError } from "../src/features/ai/video-types";
import type { PerformanceRequest } from "../src/features/media/performance-validation";
import { signVideoInput, verifyVideoInput, signedVideoInputResponse } from "../src/features/media/signed-video-input";

const db = getDatabase(), users: string[] = [], workspaces: string[] = [];
let a: { userId: string; workspaceId: string }, b: typeof a, characterId: string, directory: string, storage: LocalStorageProvider, imageId: string, sourceId: string;
class MotionFake extends FakeVideoProvider {
  configuration() { return { provider: "fal-motion", model: "fal-ai/kling-video/v3/pro/motion-control" }; }
  async capabilities() { return { referenceImages: true, durations: Array.from({ length: 28 }, (_, i) => i + 3), aspectRatios: ["16:9", "9:16", "1:1"] }; }
}
const provider = new MotionFake();
const service = (context = a) => createPerformanceService(async () => context, { audio: provider, performance: provider }, storage);
const sourceService = (context = a) => createSourceService(async () => context, storage);
const input = (): PerformanceRequest => ({ characterId, referenceAssetId: imageId, sourceId, mode: "PERFORMANCE", motion: "Wave", aspectRatio: "9:16", orientation: "video", keepOriginalSound: true });
const status = () => createVideoService(async () => a, provider, storage);
before(async () => {
  // Refuse production/external databases. Fixtures are isolated by fresh UUIDs.
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL!).hostname));
  // Mock provider reservations must never consume the local app's real quotas.
  process.env.AUTH_SECRET = randomBytes(48).toString("base64url");
  process.env.AI_GENERATION_ENABLED = "true"; process.env.VIDEO_GENERATION_ENABLED = "true"; process.env.REFERENCE_VIDEO_WORKER_ENABLED = "true";
  process.env.MOTION_PRICE_USD_PER_SECOND = "0.1"; process.env.AVATAR_PRICE_RUB_PER_SECOND = "8.5";
  process.env.MOTION_VIDEO_PROVIDER = "fal";
  process.env.MOTION_VIDEO_MODEL = "hailuo-3";
  for (const prefix of ["AI_IMAGE", "AI_VIDEO", "MEDIA_UPLOAD"]) { process.env[`${prefix}_PER_MINUTE`] = "100"; process.env[`${prefix}_PER_DAY`] = "500"; process.env[`${prefix}_GLOBAL_PER_DAY`] = "5000"; }
  directory = await mkdtemp(path.join(tmpdir(), "oblikos-performance-")); storage = new LocalStorageProvider(directory);
  for (const label of ["A", "B"]) {
    const user = await db.user.create({ data: { name: label, email: `performance-${randomUUID()}@example.com` } }); users.push(user.id);
    const workspace = await db.workspace.create({ data: { name: label, slug: randomUUID(), members: { create: { userId: user.id } } } }); workspaces.push(workspace.id);
  }
  a = { userId: users[0], workspaceId: workspaces[0] }; b = { userId: users[1], workspaceId: workspaces[1] };
  const character = await createCharacterService(async () => a).create({ ...emptyCharacter, identity: { ...emptyCharacter.identity, kind: "ANIMAL", name: "Кот", niche: "Развлечения" } }); characterId = character.id;
  assert.equal((await createCharacterService(async () => a).duplicate(characterId)).kind, "ANIMAL");
  const media = createMediaService(async () => a, new FakeImageProvider(), storage);
  imageId = (await media.generate({ characterId, instruction: "Cat in full body", format: "SCENE", aspectRatio: "9:16" }, randomUUID())).id;
  sourceId = (await sourceService().upload(characterId, "VIDEO", await readFile(new URL("./fixtures/avatar.mp4", import.meta.url)))).id;
  provider.onDownload = async () => ({ bytes: await readFile(new URL("./fixtures/avatar.mp4", import.meta.url)), mimeType: "video/mp4" });
});
after(async () => {
  try {
    for (const workspaceId of workspaces) {
      await db.mediaGeneration.deleteMany({ where: { workspaceId } }); await db.videoSource.deleteMany({ where: { workspaceId } }); await db.mediaAsset.deleteMany({ where: { workspaceId } });
      const characters = await db.character.findMany({ where: { workspaceId }, select: { id: true } }); const ids = characters.map(c => c.id);
      await db.appearance.deleteMany({ where: { characterId: { in: ids } } }); await db.personality.deleteMany({ where: { characterId: { in: ids } } });
      await db.character.deleteMany({ where: { workspaceId } }); await db.workspaceMember.deleteMany({ where: { workspaceId } }); await db.workspace.delete({ where: { id: workspaceId } });
    }
    await db.user.deleteMany({ where: { id: { in: users } } });
  } finally { await db.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); }
});

test("Seedance group quotes bind the model, square cost survives DB precision, and completion restores original sound", async () => {
  class MiniFake extends MotionFake {
    override configuration() { return { provider: "aitunnel-motion", model: "seedance-2.0-mini" }; }
    override async capabilities() { return { referenceImages: true, durations: Array.from({ length: 12 }, (_, i) => i + 4), aspectRatios: ["9:16", "16:9", "1:1"] }; }
  }
  const mini = new MiniFake(), miniService = createPerformanceService(async () => a, { audio: provider, performance: mini }, storage);
  process.env.MOTION_VIDEO_PROVIDER = "aitunnel"; process.env.MOTION_VIDEO_MODEL = "seedance-2.0-mini";
  process.env.SEEDANCE_PRICE_RUB_PER_SECOND = "12.852"; process.env.SEEDANCE_SQUARE_PRICE_RUB_PER_SECOND = "7.22925";
  try {
    const request = { ...input(), aspectRatio: "1:1", cast: "GROUP", roles: "Three kittens replace the three people left to right." };
    const smallSource = await sourceService().upload(characterId, "VIDEO", await readFile(new URL("./fixtures/video.mp4", import.meta.url)));
    const smallRequest = { ...request, sourceId: smallSource.id };
    const rejectedId = randomUUID();
    const tooSmall = (error: unknown) => error instanceof VideoError && error.code === "seedance_source_resolution";
    await assert.rejects(miniService.quote(smallRequest), tooSmall);
    await assert.rejects(miniService.enqueue(smallRequest, rejectedId, {}), tooSmall);
    assert.equal(await db.mediaGeneration.findUnique({ where: { id: rejectedId } }), null);
    assert.equal(mini.requests.length, 0);
    const quote = await miniService.quote(request);
    assert.equal(quote.model, "seedance-2.0-mini"); assert.equal(quote.amount, 36.1463);
    await assert.rejects(miniService.enqueue(request, randomUUID(), { ...quote, model: "hailuo-3" }), VideoError);
    const id = randomUUID(); await miniService.enqueue(request, id, quote); await miniService.enqueue(request, id, quote);
    const link = signVideoInput(id, "VIDEO"); assert.equal((await signedVideoInputResponse(link, storage)).status, 200);
    await Promise.all([miniService.dispatch(id), miniService.dispatch(id)]); assert.equal(mini.requests.length, 1);
    const job = await db.mediaGeneration.findUniqueOrThrow({ where: { id } });
    assert.equal(Number(job.quotedCost), quote.amount); assert.ok(job.prompt?.includes(request.roles));
    mini.jobs.set(job.providerJobId!, { id: job.providerJobId!, status: "READY" });
    mini.onDownload = async () => ({ bytes: await readFile(new URL("./fixtures/avatar.mp4", import.meta.url)), mimeType: "video/mp4" });
    await db.mediaGeneration.update({ where: { id }, data: { nextPollAt: new Date(0) } });
    const ready = await createVideoService(async () => a, mini, storage).status(id);
    assert.equal(ready.status, "READY"); assert.equal(mini.requests.length, 1);
    assert.equal((await signedVideoInputResponse(link, storage)).status, 404);
    await db.mediaGeneration.delete({ where: { id } }); await db.mediaAsset.delete({ where: { id: ready.mediaId! } });
  } finally {
    process.env.MOTION_VIDEO_PROVIDER = "fal"; process.env.MOTION_VIDEO_MODEL = "hailuo-3";
    delete process.env.SEEDANCE_PRICE_RUB_PER_SECOND; delete process.env.SEEDANCE_SQUARE_PRICE_RUB_PER_SECOND;
  }
});

test("AITUNNEL group jobs retain roles and original sound, enforce duration, and complete without another submission", async () => {
  class HailuoFake extends MotionFake {
    override configuration() { return { provider: "aitunnel-motion", model: "hailuo-3" }; }
    override async capabilities() { return { referenceImages: true, durations: Array.from({ length: 11 }, (_, i) => i + 5), aspectRatios: ["16:9", "9:16", "1:1"] }; }
  }
  const hailuo = new HailuoFake(), service = createPerformanceService(async () => a, { audio: provider, performance: hailuo }, storage);
  process.env.MOTION_VIDEO_PROVIDER = "aitunnel"; process.env.MOTION_PRICE_RUB_PER_SECOND = "22.1";
  try {
    const bytes = await readFile(new URL("./fixtures/video.mp4", import.meta.url));
    const source = await sourceService().upload(characterId, "VIDEO", bytes);
    const request = { ...input(), sourceId: source.id, keepOriginalSound: true, cast: "GROUP", roles: "Left kitten = left dancer, center kitten = center dancer, right kitten = right dancer." };
    await assert.rejects(service.quote({ ...request, orientation: "image" }), VideoError);
    await assert.rejects(service.quote({ ...request, sourceId }), (e: unknown) => e instanceof VideoError && e.code === "reference_duration");
    const quote = await service.quote(request); assert.equal(quote.currency, "RUB"); assert.equal(quote.amount, 154.7); assert.equal(quote.duration, 7);
    const id = randomUUID(); await service.enqueue(request, id, quote); await service.enqueue(request, id, quote);
    const link = signVideoInput(id, "VIDEO");
    assert.equal(verifyVideoInput(link).job, id);
    assert.equal(verifyVideoInput(`${link}.mp4`).job, id);
    assert.equal((await signedVideoInputResponse(`${link}.mp4`, storage)).status, 200);
    assert.equal((await signedVideoInputResponse(`${link}.png`, storage)).status, 404);
    assert.equal((await signedVideoInputResponse(`${link}.mov`, storage)).status, 404);
    assert.equal((await signedVideoInputResponse(`${link}tampered.mp4`, storage)).status, 404);
    const delivered = await signedVideoInputResponse(link, storage);
    assert.equal(delivered.status, 200); assert.equal(delivered.headers.get("accept-ranges"), "none");
    assert.deepEqual(Buffer.from(await delivered.arrayBuffer()), bytes);
    const head = await signedVideoInputResponse(link, storage, true);
    assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(head.headers.get("content-length"), String(bytes.length));
    assert.equal((await signedVideoInputResponse(signVideoInput(id, "IMAGE"), storage)).status, 200);
    assert.equal((await signedVideoInputResponse(`${signVideoInput(id, "IMAGE")}.png`, storage)).status, 200);
    assert.equal((await signedVideoInputResponse(`${signVideoInput(id, "IMAGE")}.mp4`, storage)).status, 404);
    assert.equal((await signedVideoInputResponse(`${link}tampered`, storage)).status, 404);
    assert.equal((await signedVideoInputResponse(signVideoInput(id, "VIDEO", Date.now() - 4 * 3600000), storage)).status, 404);
    const sourceOwner = await db.videoSource.findUniqueOrThrow({ where: { id: source.id } });
    await db.videoSource.update({ where: { id: source.id }, data: { userId: b.userId } });
    assert.equal((await signedVideoInputResponse(link, storage)).status, 404);
    await db.videoSource.update({ where: { id: source.id }, data: { userId: sourceOwner.userId } });
    await Promise.all([service.dispatch(id), service.dispatch(id)]); assert.equal(hailuo.requests.length, 1);
    const job = await db.mediaGeneration.findUniqueOrThrow({ where: { id } }); assert.equal(job.provider, "aitunnel-motion"); assert.equal(job.model, "hailuo-3");
    assert.ok(job.prompt?.includes(request.roles)); assert.ok(!job.prompt?.includes("One character"));
    assert.equal(hailuo.requests[0].performance?.keepOriginalSound, true);
    hailuo.jobs.set(job.providerJobId!, { id: job.providerJobId!, status: "READY" }); hailuo.onDownload = async () => ({ bytes, mimeType: "video/mp4" });
    await db.mediaGeneration.update({ where: { id }, data: { nextPollAt: new Date(0) } });
    const polling = createVideoService(async () => a, hailuo, storage);
    const ready = await polling.status(id); assert.equal(ready.status, "READY"); assert.equal((await polling.status(id)).mediaId, ready.mediaId); assert.equal(hailuo.requests.length, 1);
    assert.equal((await signedVideoInputResponse(link, storage)).status, 404);
    // Keep the pre-existing regression fixture's media-count assertions isolated.
    await db.mediaGeneration.delete({ where: { id } }); await db.mediaAsset.delete({ where: { id: ready.mediaId! } });
    // The original image/video DB constraint capped non-avatar clips at 13s.
    const fullPath = path.join(directory, "hailuo-full.mp4");
    await promisify(execFile)(ffmpeg!, ["-nostdin", "-hide_banner", "-loglevel", "error", "-stream_loop", "-1", "-i", "tests/fixtures/video.mp4", "-t", "14.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", fullPath], { timeout: 30000, windowsHide: true });
    const fullBytes = await readFile(fullPath), fullSource = await sourceService().upload(characterId, "VIDEO", fullBytes);
    const fullRequest = { ...request, sourceId: fullSource.id };
    const fullQuote = await service.quote(fullRequest); assert.equal(fullQuote.duration, 15); assert.equal(fullQuote.amount, 331.5);
    const fullId = randomUUID(); await service.enqueue(fullRequest, fullId, fullQuote); await service.dispatch(fullId);
    const fullJob = await db.mediaGeneration.findUniqueOrThrow({ where: { id: fullId } });
    hailuo.jobs.set(fullJob.providerJobId!, { id: fullJob.providerJobId!, status: "READY" }); hailuo.onDownload = async () => ({ bytes: fullBytes, mimeType: "video/mp4" });
    await db.mediaGeneration.update({ where: { id: fullId }, data: { nextPollAt: new Date(0) } });
    const fullReady = await polling.status(fullId); assert.equal(fullReady.status, "READY");
    assert.ok((await db.mediaAsset.findUniqueOrThrow({ where: { id: fullReady.mediaId! } })).duration! > 13);
    await assert.rejects(db.mediaAsset.update({ where: { id: fullReady.mediaId! }, data: { duration: 16.01 } }));
    assert.equal(hailuo.requests.length, 2);
    await db.mediaGeneration.delete({ where: { id: fullId } }); await db.mediaAsset.delete({ where: { id: fullReady.mediaId! } });
  } finally { process.env.MOTION_VIDEO_PROVIDER = "fal"; delete process.env.MOTION_PRICE_RUB_PER_SECOND; }
});
test("queued jobs survive replay, concurrent dispatch and repeated completion without another paid submission", async () => {
  const request = input(), id = randomUUID(), quote = await service().quote(request), before = provider.requests.length;
  await service().enqueue(request, id, quote); await service().enqueue(request, id, quote);
  assert.equal(provider.requests.length, before);
  await Promise.all([service().dispatch(id), service().dispatch(id)]); assert.equal(provider.requests.length, before + 1);
  await service().dispatch(id); assert.equal(provider.requests.length, before + 1);
  const g = await db.mediaGeneration.findUniqueOrThrow({ where: { id } }); assert.ok(g.providerJobId); assert.equal(Number(g.quotedCost), quote.amount); assert.equal(g.sourceId, sourceId);
  assert.equal((await status().activity([id])).find(job => job.id === id)?.phase, "QUEUED");
  assert.ok(provider.requests.at(-1)?.performance?.bytes.length); assert.equal(provider.requests.at(-1)?.audio, undefined);
  provider.jobs.set(g.providerJobId!, { id: g.providerJobId!, status: "READY" }); await db.mediaGeneration.update({ where: { id }, data: { nextPollAt: new Date(0) } });
  const ready = await status().status(id); assert.equal(ready.status, "READY"); assert.ok(ready.mediaId);
  assert.equal((await status().activity([id])).find(job => job.id === id)?.phase, "READY");
  assert.equal((await status().status(id)).mediaId, ready.mediaId);
  assert.equal(await db.mediaAsset.count({ where: { characterId, type: "VIDEO" } }), 1);
  await assert.rejects(service().enqueue({ ...request, motion: "Different" }, id, quote), MediaUnavailable);
});
test("foreign characters, sources and images are denied before paid calls", async () => {
  const request = input(), before = provider.requests.length;
  await assert.rejects(service(b).quote(request), MediaUnavailable);
  await assert.rejects(sourceService(b).read(sourceId, characterId), MediaUnavailable);
  await assert.rejects(service().quote({ ...request, referenceAssetId: randomUUID() }), VideoError);
  const source = await db.videoSource.findUniqueOrThrow({ where: { id: sourceId } });
  await db.videoSource.update({ where: { id: sourceId }, data: { userId: b.userId } });
  await assert.rejects(service().quote(request), VideoError);
  await db.videoSource.update({ where: { id: sourceId }, data: { userId: source.userId } });
  assert.equal(provider.requests.length, before);
});
test("uncertain submission and stale prices cannot trigger automatic paid retries", async () => {
  const request = input(), id = randomUUID(), quote = await service().quote(request);
  await assert.rejects(service().enqueue(request, randomUUID(), { ...quote, amount: 0 }), VideoError);
  await service().enqueue(request, id, quote);
  provider.onCreate = async () => { throw new VideoError("ambiguous"); };
  const before = provider.requests.length;
  await service().dispatch(id); await service().dispatch(id); provider.onCreate = undefined;
  assert.equal(provider.requests.length, before + 1);
  assert.equal((await db.mediaGeneration.findUniqueOrThrow({ where: { id } })).errorCode, "ambiguous");
  await service().enqueue(request, id, quote); await service().dispatch(id); assert.equal(provider.requests.length, before + 1);
  const changed = randomUUID(); await service().enqueue(request, changed, quote); process.env.MOTION_PRICE_USD_PER_SECOND = "0.2";
  await service().dispatch(changed); process.env.MOTION_PRICE_USD_PER_SECOND = "0.1";
  assert.equal(provider.requests.length, before + 1); assert.equal((await db.mediaGeneration.findUniqueOrThrow({ where: { id: changed } })).errorCode, "price");
});
test("status polls are bounded and an interrupted submission is never replayed", async () => {
  const request = input(), id = randomUUID(), quote = await service().quote(request);
  await service().enqueue(request, id, quote); await service().dispatch(id);
  await db.mediaGeneration.update({ where: { id }, data: { pollAttempts: 360, nextPollAt: new Date(0) } });
  const before = provider.polls; assert.equal((await status().status(id)).status, "FAILED"); assert.equal(provider.polls, before);
  const crashed = randomUUID(); await service().enqueue(request, crashed, quote);
  await db.mediaGeneration.update({ where: { id: crashed }, data: { submissionStartedAt: new Date(Date.now() - 190000) } });
  const calls = provider.requests.length; await service().dispatch(crashed); assert.equal(provider.requests.length, calls);
  assert.equal((await status().status(crashed)).status, "FAILED");
});
test("uploaded audio bypasses TTS, rejects wrong source kinds and persists only synchronized-duration results", async () => {
  const samples = Math.round(4.03 * 16000), wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  const audioSource = await sourceService().upload(characterId, "AUDIO", wav);
  const request = { ...input(), mode: "AUDIO" as const, sourceId: audioSource.id };
  await assert.rejects(service().quote({ ...request, sourceId }), VideoError);
  await assert.rejects(service().quote({ ...input(), sourceId: audioSource.id }), VideoError);
  class AvatarFake extends MotionFake { configuration() { return { provider: "aitunnel-avatar", model: "avatar-iv" }; } }
  const avatar = new AvatarFake(); avatar.onDownload = provider.onDownload;
  const audioService = createPerformanceService(async () => a, { audio: avatar, performance: provider }, storage);
  const quote = await audioService.quote(request), id = randomUUID();
  assert.equal(quote.duration, 5); assert.equal(quote.amount, 42.5);
  await audioService.enqueue(request, id, quote); await audioService.dispatch(id);
  assert.deepEqual(avatar.requests[0].audio?.bytes, wav); assert.equal(avatar.requests[0].performance, undefined);
  const g = await db.mediaGeneration.findUniqueOrThrow({ where: { id } }); avatar.jobs.set(g.providerJobId!, { id: g.providerJobId!, status: "READY" });
  await db.mediaGeneration.update({ where: { id }, data: { nextPollAt: new Date(0) } });
  let failStorage = true;
  const retryStorage = { read: storage.read.bind(storage), delete: storage.delete.bind(storage), save: async (file: Parameters<typeof storage.save>[0]) => { if (failStorage) throw new Error("Offline storage failure"); return storage.save(file); } };
  const video = createVideoService(async () => a, avatar, retryStorage);
  assert.equal((await video.status(id)).status, "PROCESSING"); failStorage = false;
  await db.mediaGeneration.update({ where: { id }, data: { nextPollAt: new Date(0) } });
  assert.equal((await video.status(id)).status, "READY"); assert.equal(avatar.requests.length, 1);
  assert.equal(await db.voicePreview.count({ where: { workspaceId: a.workspaceId } }), 0);
  await db.videoSource.update({ where: { id: audioSource.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(audioService.quote(request), VideoError);
});
test("acknowledged operation ID survives a deadline racing submission", async () => {
  const request = input(), id = randomUUID(), quote = await service().quote(request);
  await service().enqueue(request, id, quote);
  provider.onCreate = async () => {
    await db.mediaGeneration.update({ where: { id }, data: { status: "FAILED", errorCode: "deadline" } });
    return { id: randomUUID(), status: "PENDING" };
  };
  try {
    await service().dispatch(id);
    const receipt = await db.mediaGeneration.findUniqueOrThrow({ where: { id } });
    assert.ok(receipt.providerJobId); assert.equal(receipt.status, "PROCESSING");
    const calls = provider.requests.length; await service().dispatch(id); assert.equal(provider.requests.length, calls);
  } finally { provider.onCreate = undefined; }
});
