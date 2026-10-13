import "dotenv/config";
import assert from "node:assert/strict";
import { test, before, after, mock } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDatabase } from "../src/db/client";
import { createVideoService } from "../src/features/media/video-operations";
import { createMediaService, MediaUnavailable, MediaBusy, MediaArchived } from "../src/features/media/operations";
import { LocalStorageProvider, type StorageProvider } from "../src/features/media/storage";
import { inspectVideo, maxVideoBytes } from "../src/features/media/video-file";
import { parseRange, InvalidRange } from "../src/features/media/range";
import { ProxyAPIVideoProvider } from "../src/features/ai/video-provider";
import { VideoError } from "../src/features/ai/video-types";
import { GenerationSafetyError } from "../src/features/ai/safety";
import { createCharacterService } from "../src/features/characters/operations";
import { emptyCharacter } from "../src/features/characters/validation";
import { FakeImageProvider } from "./fake-image-provider";
import { FakeVideoProvider } from "./fake-video-provider";

const db = getDatabase(), users: string[] = [], workspaces: string[] = [];
let a: { userId: string; workspaceId: string }, b: typeof a, directory: string, storage: LocalStorageProvider, id: string, foreign: string, primaryId: string;
const fake = new FakeVideoProvider();
const svc = (provider = fake, context = a, store: StorageProvider = storage) => createVideoService(async () => context, provider, store);
const media = (context = a) => createMediaService(async () => context, new FakeImageProvider(), storage);
const request = (characterId = id) => ({ characterId, scene: "В кафе у окна", motion: "Поворачивается к камере", duration: 6, aspectRatio: "16:9" });

test("talking pipeline snapshots voice, preserves audio, blocks duplicate paid requests and recovers through shared jobs", async () => {
  class AvatarFake extends FakeVideoProvider {
    configuration() { return { provider: "aitunnel-avatar", model: "avatar-iv" }; }
    async capabilities() { return { referenceImages: true, durations: [5, 10, 15, 30, 60], aspectRatios: ["9:16", "16:9", "1:1"] }; }
  }
  const avatar = new AvatarFake(); let speechCalls = 0;
  avatar.onDownload = async () => ({ bytes: await readFile(new URL("./fixtures/avatar.mp4", import.meta.url)), mimeType: "video/mp4" });
  const talking = createVideoService(async () => a, avatar, storage, { talking: true, prepareSpeech: async (settings, text) => {
    speechCalls++; assert.equal(text, "Привет! Я цифровой персонаж."); assert.ok(settings === null || typeof settings === "object");
    return { bytes: Buffer.from("speech"), mimeType: "audio/wav", duration: 4 };
  } });
  const chosen = await media().generate({ characterId: id, instruction: "Белая футболка, Патриаршие пруды", format: "SCENE", aspectRatio: "9:16" }, randomUUID());
  const input = { ...request(), scene: "Привет! Я цифровой персонаж.", aspectRatio: "9:16", duration: 15, referenceAssetId: chosen.id };
  await assert.rejects(talking.create({ ...input, referenceAssetId: randomUUID() }, randomUUID()), VideoError);
  assert.equal(speechCalls, 0); assert.equal(avatar.requests.length, 0);
  const requestId = randomUUID();
  const created = await talking.create(input, requestId);
  assert.equal(created.status, "PROCESSING"); assert.equal(speechCalls, 1);
  assert.equal(avatar.requests[0].duration, 5); assert.deepEqual(avatar.requests[0].audio?.bytes, Buffer.from("speech"));
  assert.deepEqual(avatar.requests[0].reference.bytes, (await media().read(chosen.id)).bytes);
  assert.equal((await media().primary(id))!.id, primaryId);
  await talking.create(input, requestId); assert.equal(speechCalls, 1); assert.equal(avatar.requests.length, 1);
  await assert.rejects(svc().create(input, requestId)); // different request kind cannot reuse a receipt
  const receipt = await db.mediaGeneration.findUniqueOrThrow({ where: { id: requestId } });
  assert.equal(receipt.referenceAssetId, chosen.id);
  await assert.rejects(media().delete(chosen.id), MediaBusy);
  avatar.jobs.set(receipt.providerJobId!, { id: receipt.providerJobId!, status: "READY" }); await due(requestId);
  const shared = createVideoService(async () => a, fake, storage, { resolveProvider: (name) => name === "aitunnel-avatar" ? avatar : fake });
  const saved = await shared.status(requestId); assert.equal(saved.status, "READY"); assert.ok(saved.mediaId);
  assert.equal((await media().get(saved.mediaId!)).model, "avatar-iv");
  assert.equal((await media().get(saved.mediaId!)).referenceAssetId, chosen.id);
  let foreignCalls = 0;
  const foreignService = createVideoService(async () => b, avatar, storage, { talking: true, prepareSpeech: async () => { foreignCalls++; throw new Error("Should not be reached"); } });
  await assert.rejects(foreignService.create(input, randomUUID()), MediaUnavailable); assert.equal(foreignCalls, 0);
  const long = createVideoService(async () => a, avatar, storage, { talking: true, prepareSpeech: async () => ({ bytes: Buffer.from("long"), mimeType: "audio/wav", duration: 16 }) });
  const before = avatar.requests.length;
  const failed = await long.create(input, randomUUID()); assert.equal(failed.status, "FAILED"); assert.match(failed.message!, /длиннее/); assert.equal(avatar.requests.length, before);
});
test("unified video provider without a verified reference encoder cannot call create even with valid configuration", async () => {
  const original = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_VIDEO_MODEL, base: process.env.OPENAI_BASE_URL };
  process.env.OPENAI_API_KEY = "offline-video-key"; process.env.OPENAI_VIDEO_MODEL = "google/veo-3.1-fast"; process.env.OPENAI_BASE_URL = "https://api.proxyapi.ru/v1";
  const transport = mock.method(globalThis, "fetch", async () => { throw new Error("Production video must not reach a provider"); });
  try {
    const provider = new ProxyAPIVideoProvider();
    const blocked = (error: unknown) => error instanceof VideoError && error.code === "configuration";
    await assert.rejects(provider.capabilities(), blocked);
    await assert.rejects(provider.createVideo({ prompt: "Offline primary image", duration: 4, aspectRatio: "16:9", reference: { bytes: Buffer.from([1, 2, 3]), mimeType: "image/png" } }), blocked);
    assert.equal(transport.mock.callCount(), 0);
  } finally {
    transport.mock.restore();
    for (const [name, value] of [["OPENAI_API_KEY", original.key], ["OPENAI_VIDEO_MODEL", original.model], ["OPENAI_BASE_URL", original.base]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  }
});
async function due(generationId: string) { await db.mediaGeneration.update({ where: { id: generationId }, data: { nextPollAt: new Date(0), pollLeaseUntil: null } }); }
async function ready(generationId: string) {
  const g = await db.mediaGeneration.findUniqueOrThrow({ where: { id: generationId } }); fake.jobs.set(g.providerJobId!, { id: g.providerJobId!, status: "READY" }); await due(generationId); return svc().status(generationId);
}
before(async () => {
  // Keep mocked provider calls out of the local app's persistent quota namespace.
  process.env.AUTH_SECRET = randomBytes(48).toString("base64url");
  process.env.VIDEO_GENERATION_ENABLED = "true";
  process.env.AI_VIDEO_PER_MINUTE = "100";
  process.env.AI_VIDEO_PER_DAY = "500";
  process.env.AI_VIDEO_GLOBAL_PER_DAY = "5000";
  process.env.AI_IMAGE_PER_MINUTE = "100";
  process.env.AI_IMAGE_PER_DAY = "500";
  process.env.AI_IMAGE_GLOBAL_PER_DAY = "5000";
  directory = await mkdtemp(path.join(tmpdir(), "oblikos-video-test-")); storage = new LocalStorageProvider(directory);
  for (const label of ["A", "B"]) {
    const u = await db.user.create({ data: { name: `Video ${label}`, email: `video-${randomUUID()}@example.com` } }); users.push(u.id);
    const ws = await db.workspace.create({ data: { name: label, slug: randomUUID(), members: { create: { userId: u.id } } } }); workspaces.push(ws.id);
  }
  a = { userId: users[0], workspaceId: workspaces[0] }; b = { userId: users[1], workspaceId: workspaces[1] };
  for (const context of [a, b]) {
    const c = await createCharacterService(async () => context).create({ ...emptyCharacter, identity: { ...emptyCharacter.identity, name: "Дарья Видео", gender: "Женский", ageRange: "25–34", niche: "Красота" } });
    if (context === a) id = c.id; else foreign = c.id;
  }
  primaryId = (await media().generate({ characterId: id, instruction: "", format: "PORTRAIT", aspectRatio: "1:1" }, randomUUID())).id;
  await media().setPrimary(primaryId, id);
});
after(async () => {
  try {
    const where = { character: { workspaceId: { in: workspaces } } };
    await db.mediaGeneration.deleteMany({ where }); await db.mediaAsset.deleteMany({ where });
    await db.appearance.deleteMany({ where }); await db.personality.deleteMany({ where });
    await db.character.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } }); await db.user.deleteMany({ where: { id: { in: users } } });
  } finally { await db.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); }
});
test("create persists job/reference; queued and processing survive new service/reload; ready saves storage/video", async () => {
  const g = await svc().create(request(), randomUUID()); assert.equal(g.status, "PROCESSING"); assert.equal(g.phase, "QUEUED");
  const row = await db.mediaGeneration.findUniqueOrThrow({ where: { id: g.id } }); assert.ok(row.providerJobId); assert.equal(row.referenceAssetId, primaryId);
  assert.equal((await svc().list(id)).find((e) => e.id === g.id)?.status, "PROCESSING");
  assert.ok(!("providerJobId" in g)); assert.ok(!("model" in g));
  assert.deepEqual(fake.requests.at(-1)?.reference.bytes, (await media().read(primaryId)).bytes);
  await due(g.id); assert.equal((await svc().status(g.id)).status, "PROCESSING");
  const beforeActivity = { requests: fake.requests.length, polls: fake.polls };
  assert.equal((await svc().activity([])).find(item => item.id === g.id)?.phase, "QUEUED");
  assert.deepEqual({ requests: fake.requests.length, polls: fake.polls }, beforeActivity);
  fake.jobs.set(row.providerJobId!, { id: row.providerJobId!, status: "PROCESSING" }); await due(g.id); const generating = await svc().status(g.id); assert.equal(generating.status, "PROCESSING"); assert.equal(generating.phase, "GENERATING");
  const saved = await ready(g.id); assert.equal(saved.status, "READY"); assert.ok(saved.mediaId);
  assert.equal((await svc().activity([g.id])).find(item => item.id === g.id)?.phase, "READY");
  assert.equal((await svc(fake, b).activity([g.id])).some(item => item.id === g.id), false);
  await assert.rejects(svc().activity(Array.from({ length: 49 }, () => randomUUID())));
  const asset = await media().get(saved.mediaId!); assert.equal(asset.type, "VIDEO"); assert.equal(asset.referenceAssetId, primaryId); assert.equal(asset.referenceUsed, true); assert.ok(asset.duration! > 0);
  assert.deepEqual((await media().read(asset.id)).bytes, await readFile("tests/fixtures/video.mp4"));
  assert.ok((await media().list(undefined, 1, "VIDEO")).entries.some((e) => e.id === asset.id));
  await assert.rejects(media().setPrimary(asset.id, id), MediaUnavailable);
  assert.equal((await svc().status(g.id)).mediaId, asset.id); // Ready replay cannot duplicate asset.
});
test("double submit/concurrent receipt replay/lost response never creates second paid job", async () => {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => { enter = r; }), gate = new Promise<void>((r) => { release = r; });
  const provider = new FakeVideoProvider(); provider.onCreate = async () => { enter(); await gate; return { id: randomUUID(), status: "PENDING" }; };
  const key = randomUUID(), first = svc(provider).create(request(), key); await entered;
  const second = await svc(provider).create(request(), key); assert.equal(second.status, "PENDING"); release(); const saved = await first;
  assert.equal((await svc(provider).create(request(), key)).id, saved.id); assert.equal(provider.requests.length, 1);
  await assert.rejects(svc(provider).create({ ...request(), motion: "другое" }, key), MediaUnavailable);
  const newKey = randomUUID(), outcomes = await Promise.all([svc().create(request(), newKey), svc().create(request(), newKey)]);
  assert.equal(outcomes[0].id, outcomes[1].id);
  assert.equal(await db.mediaGeneration.count({ where: { id: newKey } }), 1);
});
test("tenant checks, forged fields, archived/deleted/missing primary and invalid parameters precede paid calls", async () => {
  const g = await svc().create(request(), randomUUID()), calls = fake.requests.length;
  const chars = createCharacterService(async () => a), copy = await chars.duplicate(id);
  for (const operation of [() => svc(fake, b).create(request(), randomUUID()), () => svc().create(request(foreign), randomUUID()), () => svc(fake, b).status(g.id), () => svc(fake, b).list(id), () => svc(fake, { userId: randomUUID(), workspaceId: a.workspaceId }).status(g.id)]) await assert.rejects(operation, MediaUnavailable);
  assert.equal((await svc(fake, b).list()).length, 0);
  await assert.rejects(svc().create(request(copy.id), randomUUID()), VideoError);
  await assert.rejects(svc().create({ ...request(), workspaceId: b.workspaceId }, randomUUID()));
  await assert.rejects(svc().create({ ...request(), scene: " " }, randomUUID()));
  for (const input of [{ ...request(), duration: 7 }, { ...request(), aspectRatio: "1:1" }]) await assert.rejects(svc().create(input, randomUUID()), VideoError);
  await chars.manage(copy.id, "archive"); await assert.rejects(svc().create(request(copy.id), randomUUID()), MediaArchived);
  await chars.manage(copy.id, "delete"); await assert.rejects(svc().create(request(copy.id), randomUUID()), MediaUnavailable);
  assert.equal(fake.requests.length, calls);
});
test("reference snapshot is stable and deletion is blocked during active video generation", async () => {
  const reference = (await media().primary(id))!;
  const g = await svc().create(request(), randomUUID());
  const next = await media().generate({ characterId: id, instruction: "новый", format: "PORTRAIT", aspectRatio: "1:1" }, randomUUID());
  await media().setPrimary(next.id, id); await assert.rejects(media().delete(reference.id), MediaBusy);
  const saved = await ready(g.id); assert.equal((await media().get(saved.mediaId!)).referenceAssetId, reference.id);
  const after = await svc().create(request(), randomUUID()); assert.equal((await db.mediaGeneration.findUniqueOrThrow({ where: { id: after.id } })).referenceAssetId, next.id);
  primaryId = next.id;
});
test("explicit video image is scoped, snapshotted, works without a primary and participates in request identity", async () => {
  const chars = createCharacterService(async () => a);
  const copy = await chars.duplicate(id);
  const chosen = await media().generate({ characterId: copy.id, instruction: "Новый образ", format: "SCENE", aspectRatio: "9:16" }, randomUUID());
  assert.equal(await media().primary(copy.id), null);
  const input = { ...request(copy.id), referenceAssetId: chosen.id };
  const key = randomUUID(), before = fake.requests.length;
  const generation = await svc().create(input, key);
  assert.equal(generation.status, "PROCESSING");
  assert.equal((await db.mediaGeneration.findUniqueOrThrow({ where: { id: key } })).referenceAssetId, chosen.id);
  assert.deepEqual(fake.requests.at(-1)!.reference.bytes, (await media().read(chosen.id)).bytes);
  await svc().create(input, key); assert.equal(fake.requests.length, before + 1);
  await assert.rejects(svc().create({ ...input, referenceAssetId: primaryId }, key), MediaUnavailable);
  await assert.rejects(media().delete(chosen.id), MediaBusy);
  const saved = await ready(generation.id);
  assert.equal((await media().get(saved.mediaId!)).referenceAssetId, chosen.id);
  assert.equal(await media().primary(copy.id), null);
  const foreignImage = await media(b).generate({ characterId: foreign, instruction: "", format: "PORTRAIT", aspectRatio: "1:1" }, randomUUID());
  const deletedImage = await media().generate({ characterId: copy.id, instruction: "Удалённое", format: "SCENE", aspectRatio: "9:16" }, randomUUID());
  await media().delete(deletedImage.id);
  const paid = fake.requests.length;
  for (const referenceAssetId of [primaryId, foreignImage.id, deletedImage.id, saved.mediaId!, randomUUID()]) {
    await assert.rejects(svc().create({ ...input, referenceAssetId }, randomUUID()), VideoError);
  }
  await assert.rejects(svc().create({ ...input, referenceAssetId: "invalid" }, randomUUID()));
  assert.equal(fake.requests.length, paid);
});

test("FAILED/moderation and ambiguous create are terminal; same UUID does not auto retry", async () => {
  const provider = new FakeVideoProvider(); provider.onCreate = async () => { throw new VideoError("ambiguous"); };
  const key = randomUUID(), g = await svc(provider).create(request(), key); assert.equal(g.status, "FAILED"); assert.match(g.message!, /заблокирован/);
  await svc(provider).create(request(), key); assert.equal(provider.requests.length, 1);
  const failed = await svc().create(request(), randomUUID()); const row = await db.mediaGeneration.findUniqueOrThrow({ where: { id: failed.id } });
  fake.jobs.set(row.providerJobId!, { id: row.providerJobId!, status: "FAILED", error: "moderation" }); await due(failed.id);
  assert.equal((await svc().status(failed.id)).status, "FAILED"); assert.equal((await db.mediaGeneration.findUniqueOrThrow({ where: { id: failed.id } })).mediaId, null);
  assert.equal((await svc().create(request(), failed.id)).status, "FAILED");
  // Explicit new UUID is the only paid retry.
  const before = fake.requests.length; await svc().create(request(), randomUUID()); assert.equal(fake.requests.length, before + 1);
});
test("persistent poll lease/minimum interval avoids concurrent downloads; status failure recovers", async () => {
  const provider = new FakeVideoProvider(); const g = await svc(provider).create(request(), randomUUID()); await due(g.id);
  provider.onStatus = async (jobId) => { await new Promise((r) => setTimeout(r, 50)); return { id: jobId, status: "PROCESSING" }; };
  await Promise.all([svc(provider).status(g.id), svc(provider).status(g.id)]); assert.equal(provider.polls, 1);
  await svc(provider).status(g.id); assert.equal(provider.polls, 1);
  provider.onStatus = async () => { throw new VideoError("timeout"); }; await due(g.id);
  assert.equal((await svc(provider).status(g.id)).status, "PROCESSING");
  provider.onStatus = async (jobId) => ({ id: jobId, status: "READY" }); await due(g.id);
  assert.equal((await svc(provider).status(g.id)).status, "READY"); assert.equal(provider.requests.length, 1);
});
test("save failure retries download only; invalid container cannot produce an asset; delete is repeatable", async () => {
  const provider = new FakeVideoProvider(); const g = await svc(provider).create(request(), randomUUID());
  provider.onStatus = async (jobId) => ({ id: jobId, status: "READY" }); await due(g.id);
  const broken: StorageProvider = { read: (key) => storage.read(key), delete: (key) => storage.delete(key), save: async () => { throw new VideoError("storage"); } };
  assert.equal((await svc(provider, a, broken).status(g.id)).status, "PROCESSING"); await due(g.id);
  const saved = await svc(provider).status(g.id); assert.equal(saved.status, "READY"); assert.equal(provider.requests.length, 1);
  const asset = await media().get(saved.mediaId!); await media().delete(asset.id); await media().delete(asset.id);
  await assert.rejects(media().read(asset.id), MediaUnavailable); await assert.rejects(storage.read(asset.storageKey));
  const bad = await svc(provider).create(request(), randomUUID()); provider.onDownload = async () => ({ bytes: Buffer.from("<html>secret provider error</html>"), mimeType: "video/mp4" }); await due(bad.id);
  assert.equal((await svc(provider).status(bad.id)).status, "FAILED");
});
test("archived playback, deleted file security, duplicate has no video/jobs/reference", async () => {
  const chars = createCharacterService(async () => a); const copy = await chars.duplicate(id);
  assert.equal((await media().list(copy.id)).total, 0); assert.equal(await media().primary(copy.id), null); assert.equal((await svc().list(copy.id)).length, 0);
  const image = await media().generate({ characterId: copy.id, instruction: "", format: "PORTRAIT", aspectRatio: "1:1" }, randomUUID()); await media().setPrimary(image.id, copy.id);
  const g = await svc().create(request(copy.id), randomUUID()); await chars.manage(copy.id, "archive"); const saved = await ready(g.id);
  const asset = await media().get(saved.mediaId!); assert.equal((await media().read(asset.id)).mimeType, "video/mp4");
  await assert.rejects(svc().create(request(copy.id), randomUUID()), MediaArchived);
  await chars.manage(copy.id, "delete"); await assert.rejects(svc().status(g.id), MediaUnavailable); await assert.rejects(media().open(asset.id), MediaUnavailable); assert.ok((await storage.read(asset.storageKey)).length > 0);
});
test("MP4 structure/metadata/size and local storage streaming byte ranges", async () => {
  const bytes = await readFile("tests/fixtures/video.mp4"); const metadata = inspectVideo(bytes, "video/mp4"); assert.equal(metadata.width, 320); assert.equal(metadata.height, 240);
  for (const [data, mime] of [[bytes, "text/html"], [bytes.subarray(0, 50), "video/mp4"], [Buffer.alloc(maxVideoBytes + 1), "video/mp4"], [Buffer.from('{"url":"secret"}'), "video/mp4"]] as const) assert.throws(() => inspectVideo(data, mime), VideoError);
  const key = await storage.save({ workspaceId: a.workspaceId, characterId: id, extension: "mp4", bytes });
  const file = await storage.open(key); assert.equal(file.size, bytes.length);
  assert.deepEqual(Buffer.from(await new Response(file.stream(0, 99)).arrayBuffer()), bytes.subarray(0, 100));
  assert.deepEqual(parseRange("bytes=0-99", bytes.length), { start: 0, end: 99 }); assert.deepEqual(parseRange("bytes=-100", 300), { start: 200, end: 299 }); assert.deepEqual(parseRange("bytes=100-", 300), { start: 100, end: 299 }); assert.deepEqual(parseRange("bytes=0-999", 300), { start: 0, end: 299 });
  for (const range of ["bytes=999999-", "bytes=1-0", "bytes=-0", "bytes=0-1,3-4", "bytes=-", "items=0-2", "bytes=9007199254740992-"]) assert.throws(() => parseRange(range, 300), InvalidRange);
  await storage.delete(key);
});
test("current unified API uses fixed endpoints, safe download/no redirect, config missing blocks create", async () => {
  const keys = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_VIDEO_MODEL"];
  const originals = Object.fromEntries(keys.map((k) => [k, process.env[k]])); Object.assign(process.env, { OPENAI_API_KEY: "test-video-key", OPENAI_BASE_URL: "https://api.proxyapi.ru/v1", OPENAI_VIDEO_MODEL: "offline/test-model" });
  let url = "", status = 200, content = false;
  const bytes = await readFile("tests/fixtures/video.mp4");
  const transport = mock.method(globalThis, "fetch", async (input: unknown, init: RequestInit) => {
    url = String(input); assert.equal(init.redirect, "error"); assert.ok(url.startsWith("https://api.proxyapi.ru/v1/videos/"));
    if (url.endsWith("/content")) return new Response(content ? "<html>invalid</html>" : bytes, { status, headers: { "content-type": content ? "text/html" : "video/mp4" } });
    return new Response(JSON.stringify({ id: "job-a", status: "completed", unsigned_urls: ["http://127.0.0.1/private"] }), { status });
  });
  try {
    const provider = new ProxyAPIVideoProvider();
    // No undocumented reference encoder: fail closed, even with a selected model.
    assert.deepEqual(provider.configuration(), { provider: "proxyapi-video", model: "offline/test-model" });
    await assert.rejects(provider.capabilities(), VideoError); assert.equal(transport.mock.callCount(), 0);
    await assert.rejects(provider.createVideo({ prompt: "Offline reference guard", duration: 4, aspectRatio: "16:9", reference: { bytes: Buffer.from("primary-image-bytes"), mimeType: "image/png" } }), (error: unknown) => error instanceof VideoError && error.code === "configuration");
    assert.equal(transport.mock.callCount(), 0, "selected model without verified reference contract must never issue a create or other network request");
    assert.equal((await provider.getVideoStatus("job-a")).status, "READY"); assert.equal(url, "https://api.proxyapi.ru/v1/videos/job-a");
    assert.deepEqual((await provider.downloadVideo("job-a")).bytes, bytes); content = true; await assert.rejects(provider.downloadVideo("job-a"), VideoError);
    content = false; status = 503; const count = transport.mock.callCount(); await assert.rejects(provider.getVideoStatus("job-a"), VideoError); assert.equal(transport.mock.callCount(), count + 1);
    delete process.env.OPENAI_VIDEO_MODEL; await assert.rejects(provider.getVideoStatus("job-a"), VideoError);
  } finally { transport.mock.restore(); for (const k of keys) { if (originals[k] === undefined) delete process.env[k]; else process.env[k] = originals[k]; } }
});
test("stale pending receipt becomes ambiguous failure without automatic provider resubmission", async () => {
  const key = randomUUID(), calls = fake.requests.length;
  await db.mediaGeneration.create({ data: { id: key, workspaceId: a.workspaceId, characterId: id, fingerprint: "0".repeat(64), type: "VIDEO", referenceAssetId: primaryId, createdAt: new Date(Date.now() - 100000) } });
  const g = await svc().status(key); assert.equal(g.status, "FAILED"); assert.match(g.message!, /заблокирован/); assert.equal(fake.requests.length, calls);
});
test("revoked membership and deleted character during download cannot save a playable video", async () => {
  const provider = new FakeVideoProvider(), chars = createCharacterService(async () => a), local = await chars.duplicate(id);
  const image = await media().generate({ characterId: local.id, instruction: "", format: "PORTRAIT", aspectRatio: "1:1" }, randomUUID()); await media().setPrimary(image.id, local.id);
  const g = await svc(provider).create(request(local.id), randomUUID());
  provider.onStatus = async (jobId) => ({ id: jobId, status: "READY" });
  provider.onDownload = async () => { await chars.manage(local.id, "delete"); return { bytes: await readFile("tests/fixtures/video.mp4"), mimeType: "video/mp4" }; };
  await due(g.id); await assert.rejects(svc(provider).status(g.id), MediaUnavailable);
  assert.equal(await db.mediaAsset.count({ where: { characterId: local.id, type: "VIDEO" } }), 0);
  const other = await svc(provider).create(request(), randomUUID()); await due(other.id);
  const member = await db.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: a } });
  provider.onDownload = async () => { await db.workspaceMember.delete({ where: { id: member.id } }); return { bytes: await readFile("tests/fixtures/video.mp4"), mimeType: "video/mp4" }; };
  try { await assert.rejects(svc(provider).status(other.id), MediaUnavailable); assert.equal((await db.mediaGeneration.findUniqueOrThrow({ where: { id: other.id } })).mediaId, null); }
  finally { await db.workspaceMember.create({ data: member }); }
});
test("failed history cannot hide an active video job from recovery", async () => {
  const g = await svc().create(request(), randomUUID());
  await db.mediaGeneration.createMany({ data: Array.from({ length: 50 }, () => ({ id: randomUUID(), workspaceId: a.workspaceId, characterId: id, fingerprint: "f".repeat(64), type: "VIDEO" as const, status: "FAILED" as const })) });
  const list = await svc().list(id); assert.ok(list.some((e) => e.id === g.id)); assert.ok(list.length <= 48);
});

test("video switch and quota prevent provider calls; rejected receipt replay stays terminal", async () => {
  const calls = fake.requests.length;
  process.env.VIDEO_GENERATION_ENABLED = "false";
  await assert.rejects(svc().create(request(), randomUUID()), (error: unknown) => error instanceof GenerationSafetyError && error.code === "disabled");
  assert.equal(fake.requests.length, calls);
  process.env.VIDEO_GENERATION_ENABLED = "true";
  process.env.AI_VIDEO_GLOBAL_PER_DAY = "1";
  try {
    const key = randomUUID(), job = await svc().create(request(), key);
    assert.equal(job.status, "FAILED"); assert.match(job.message!, /лимит/);
    assert.equal((await svc().create(request(), key)).status, "FAILED");
    assert.equal(fake.requests.length, calls);
  } finally { process.env.AI_VIDEO_GLOBAL_PER_DAY = "5000"; }
});
