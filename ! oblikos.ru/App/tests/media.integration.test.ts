import "dotenv/config";
import assert from "node:assert/strict";
import { test, before, after, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { getDatabase } from "../src/db/client";
import { createMediaService, MediaUnavailable, MediaBusy, MediaFailed, MediaArchived } from "../src/features/media/operations";
import { LocalStorageProvider, type StorageProvider } from "../src/features/media/storage";
import { inspectImage, maxImageBytes } from "../src/features/media/image-file";
import { buildVisualContext, buildCharacterImagePrompt } from "../src/features/ai/visual-context";
import { ImageError } from "../src/features/ai/image-types";
import { OpenAICompatibleImageProvider } from "../src/features/ai/image-provider";
import { createCharacterService } from "../src/features/characters/operations";
import { emptyCharacter } from "../src/features/characters/validation";
import { FakeImageProvider } from "./fake-image-provider";

const db = getDatabase();
const users: string[] = [], workspaces: string[] = [];
let aContext: { userId: string; workspaceId: string }, bContext: typeof aContext;
let directory: string, storage: LocalStorageProvider, image: Buffer, id: string, otherId: string;
const fake = new FakeImageProvider();
const a = () => createMediaService(async () => aContext, fake, storage);
const b = () => createMediaService(async () => bContext, fake, storage);
const request = (characterId = id) => ({ characterId, instruction: "В кафе у окна", format: "PORTRAIT", aspectRatio: "4:5" });
before(async () => {
  process.env.AI_IMAGE_PER_MINUTE = "100";
  process.env.AI_IMAGE_PER_DAY = "500";
  process.env.AI_IMAGE_GLOBAL_PER_DAY = "5000";
  directory = await mkdtemp(path.join(tmpdir(), "oblikos-media-test-")); storage = new LocalStorageProvider(directory);
  image = await sharp({ create: { width: 120, height: 160, channels: 3, background: "#d3c1aa" } }).png().toBuffer();
  for (const label of ["A", "B"]) {
    const user = await db.user.create({ data: { name: `Media ${label}`, email: `media-${randomUUID()}@example.com` } }); users.push(user.id);
    const ws = await db.workspace.create({ data: { name: label, slug: randomUUID(), members: { create: { userId: user.id } } } }); workspaces.push(ws.id);
  }
  aContext = { userId: users[0], workspaceId: workspaces[0] }; bContext = { userId: users[1], workspaceId: workspaces[1] };
  const characters = createCharacterService(async () => aContext);
  id = (await characters.create({ ...emptyCharacter, identity: { ...emptyCharacter.identity, name: "Дарья", gender: "Женский", ageRange: "25–34", niche: "Красота", biography: "Не включать в визуальный контекст" }, appearance: { ...emptyCharacter.appearance, hairColor: "Рыжие", visualDescription: "Веснушки" } })).id;
  otherId = (await createCharacterService(async () => bContext).create({ ...emptyCharacter, identity: { ...emptyCharacter.identity, name: "Чужой", gender: "Мужской", ageRange: "25–34", niche: "Технологии" } })).id;
});
after(async () => {
  try {
    const where = { character: { workspaceId: { in: workspaces } } };
    await db.mediaGeneration.deleteMany({ where }); await db.mediaAsset.deleteMany({ where });
    await db.contentGeneration.deleteMany({ where }); await db.content.deleteMany({ where });
    await db.memoryEntry.deleteMany({ where }); await db.appearance.deleteMany({ where }); await db.personality.deleteMany({ where });
    await db.character.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } }); await db.user.deleteMany({ where: { id: { in: users } } });
  } finally { await db.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); }
});

test("generate saves own bytes and metadata; primary, change primary, reference input; delete resets primary", async () => {
  const first = await a().generate(request(), randomUUID());
  assert.equal(first.workspaceId, aContext.workspaceId); assert.equal(first.type, "IMAGE"); assert.equal(first.isPrimaryReference, false);
  assert.equal(first.width, 120); assert.equal(first.height, 160); assert.equal(first.fileSize, image.length);
  assert.deepEqual((await a().read(first.id)).bytes, image);
  assert.ok((await a().list(id)).entries.some((e) => e.id === first.id));
  await a().setPrimary(first.id, id); assert.equal((await a().primary(id))?.id, first.id);
  const second = await a().generate(request(), randomUUID());
  assert.equal(second.referenceUsed, true); assert.equal(second.referenceAssetId, first.id);
  assert.deepEqual(fake.requests.at(-1)?.referenceImages?.[0].bytes, image);
  await a().setPrimary(second.id, id); assert.equal((await a().primary(id))?.id, second.id);
  assert.equal((await a().get(first.id)).isPrimaryReference, false);
  assert.equal(await db.mediaAsset.count({ where: { characterId: id, isPrimaryReference: true } }), 1);
  await a().delete(second.id); assert.equal(await a().primary(id), null);
  await assert.rejects(a().get(second.id), MediaUnavailable); await assert.rejects(a().read(second.id), MediaUnavailable);
  await assert.rejects(storage.read(second.storageKey), ImageError);
  await a().delete(second.id); // safe deletion replay after file is gone
});

test("DB primary uniqueness and compound tenant consistency; concurrent primary choices", async () => {
  const first = await a().generate(request(), randomUUID()), second = await a().generate(request(), randomUUID());
  await a().setPrimary(first.id, id);
  await assert.rejects(db.mediaAsset.update({ where: { id: second.id }, data: { isPrimaryReference: true } }));
  const outcomes = await Promise.allSettled([a().setPrimary(first.id, id), a().setPrimary(second.id, id)]);
  assert.ok(outcomes.some((r) => r.status === "fulfilled"));
  assert.equal(await db.mediaAsset.count({ where: { characterId: id, isPrimaryReference: true } }), 1);
  await assert.rejects(db.mediaAsset.update({ where: { id: first.id }, data: { workspaceId: bContext.workspaceId } }));
});

test("durable idempotency for simultaneous, replayed, changed and deleted requests", async () => {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const provider = new FakeImageProvider(true, async (r) => { enter(); await gate; return { bytes: image, provider: "fake", model: "test", referenceUsed: Boolean(r.referenceImages) }; });
  const service = createMediaService(async () => aContext, provider, storage);
  const key = randomUUID(); const first = service.generate(request(), key); await entered;
  await assert.rejects(service.generate(request(), key), MediaBusy); release(); const saved = await first;
  assert.equal((await service.generate(request(), key)).id, saved.id); assert.equal(provider.requests.length, 1);
  await assert.rejects(service.generate({ ...request(), instruction: "другое" }, key), MediaUnavailable);
  await service.delete(saved.id); await assert.rejects(service.generate(request(), key), MediaUnavailable);
  assert.equal(provider.requests.length, 1);
});

test("Workspace isolation on all operations, forged payload and anonymous context", async () => {
  const asset = await a().generate(request(), randomUUID()); const calls = fake.requests.length;
  for (const op of [() => b().get(asset.id), () => b().read(asset.id), () => b().list(id), () => b().primary(id), () => b().setPrimary(asset.id, id), () => b().delete(asset.id), () => b().generate(request(), randomUUID()), () => a().generate(request(otherId), randomUUID()), () => a().setPrimary(asset.id, otherId)]) await assert.rejects(op, MediaUnavailable);
  assert.equal((await b().list()).total, 0);
  await assert.rejects(a().generate({ ...request(), workspaceId: bContext.workspaceId }, randomUUID()));
  const anonymous = createMediaService(async () => ({ userId: randomUUID(), workspaceId: aContext.workspaceId }), fake, storage);
  for (const op of [() => anonymous.list(), () => anonymous.get(asset.id), () => anonymous.read(asset.id), () => anonymous.setPrimary(asset.id, id), () => anonymous.delete(asset.id), () => anonymous.generate(request(), randomUUID())]) await assert.rejects(op, MediaUnavailable);
  assert.equal(fake.requests.length, calls);
  await assert.rejects(a().generate(request("../bad"), randomUUID()));
  await assert.rejects(a().generate(request(randomUUID()), randomUUID()), MediaUnavailable);
});

test("visual context has Appearance and Identity, no Memory/personality/metadata; prompt sections and fallback", async () => {
  const c = await createCharacterService(async () => aContext).get(id);
  const context = buildVisualContext(c);
  assert.equal(context.identity.name, "Дарья"); assert.equal(context.appearance.hairColor, "Рыжие");
  const text = JSON.stringify(context); for (const excluded of ["workspaceId", "createdAt", "personality", "biography", "Memory"]) assert.ok(!text.includes(excluded));
  const prompt = buildCharacterImagePrompt(context, { ...request(), format: "SCENE", aspectRatio: "16:9" }, true);
  for (const section of ["CHARACTER VISUAL IDENTITY", "SCENE / USER REQUEST", "IMAGE REQUIREMENTS"]) assert.ok(prompt.includes(section));
  const provider = new FakeImageProvider(false); const service = createMediaService(async () => aContext, provider, storage);
  const asset = await service.generate(request(), randomUUID()); assert.equal(asset.referenceUsed, false); assert.equal(provider.requests[0].referenceImages, undefined);
  assert.match(provider.requests[0].prompt, /No reference image is supplied/);
});

test("archived media readable; archived generation rejected; duplicate has Appearance but no Media or primary; deleted hidden", async () => {
  const chars = createCharacterService(async () => aContext);
  const local = await chars.duplicate(id); const asset = await a().generate(request(local.id), randomUUID()); await a().setPrimary(asset.id, local.id);
  await chars.manage(local.id, "archive"); await assert.rejects(a().generate(request(local.id), randomUUID()), MediaArchived);
  assert.equal((await a().read(asset.id)).mimeType, "image/png");
  const copy = await chars.duplicate(local.id); assert.equal(copy.appearance?.hairColor, "Рыжие"); assert.equal((await a().list(copy.id)).total, 0); assert.equal(await a().primary(copy.id), null);
  await chars.manage(local.id, "delete");
  for (const op of [() => a().get(asset.id), () => a().read(asset.id), () => a().list(local.id), () => a().setPrimary(asset.id, local.id), () => a().delete(asset.id), () => a().generate(request(local.id), randomUUID())]) await assert.rejects(op, MediaUnavailable);
  assert.ok(!(await a().list()).entries.some((e) => e.id === asset.id));
  assert.deepEqual(await storage.read(asset.storageKey), image); // Soft-delete doesn't physically purge media.
});

test("failures never create assets; failed receipts prevent paid retry even with same UUID", async () => {
  for (const code of ["configuration", "timeout", "rate_limit", "network", "provider", "response"] as const) {
    const provider = new FakeImageProvider(true, async () => { throw new ImageError(code); });
    const service = createMediaService(async () => aContext, provider, storage); const key = randomUUID(); const count = (await a().list()).total;
    await assert.rejects(service.generate(request(), key), ImageError); await assert.rejects(service.generate(request(), key), MediaFailed);
    assert.equal(provider.requests.length, 1); assert.equal((await a().list()).total, count);
  }
  const bad = createMediaService(async () => aContext, new FakeImageProvider(false, async () => ({ bytes: Buffer.from("not an image at all"), provider: "fake", model: "test", referenceUsed: false })), storage);
  await assert.rejects(bad.generate(request(), randomUUID()), ImageError);
  const broken: StorageProvider = { save: async () => { throw new ImageError("storage"); }, read: (key) => storage.read(key), delete: (key) => storage.delete(key) };
  const beforeCount = (await a().list()).total;
  await assert.rejects(createMediaService(async () => aContext, fake, broken).generate(request(), randomUUID()), ImageError);
  assert.equal((await a().list()).total, beforeCount);
});

test("state/access change during AI and DB failure after save clean up orphan files", async () => {
  const chars = createCharacterService(async () => aContext);
  const local = await chars.duplicate(id);
  let savedKey = "";
  const tracked: StorageProvider = { read: (key) => storage.read(key), delete: (key) => storage.delete(key), save: async (input) => { savedKey = await storage.save(input); await chars.manage(local.id, "delete"); return savedKey; } };
  await assert.rejects(createMediaService(async () => aContext, fake, tracked).generate(request(local.id), randomUUID()), MediaUnavailable);
  await assert.rejects(storage.read(savedKey), ImageError);
  const failingRequestId = randomUUID();
  const failing: StorageProvider = { read: (key) => storage.read(key), delete: (key) => storage.delete(key), save: async (input) => {
    savedKey = await storage.save(input);
    // Simulate a DB write failure after asset insert: missing receipt makes the
    // final transactional update fail and rolls back the newly created asset.
    await db.mediaGeneration.delete({ where: { id: failingRequestId } });
    return savedKey;
  } };
  await assert.rejects(createMediaService(async () => aContext, new FakeImageProvider(false), failing).generate(request(), failingRequestId));
  await assert.rejects(storage.read(savedKey), ImageError);
  const member = await db.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: aContext } });
  const revoke = new FakeImageProvider(false, async () => { await db.workspaceMember.delete({ where: { id: member.id } }); return { bytes: image, provider: "fake", model: "test", referenceUsed: false }; });
  try { await assert.rejects(createMediaService(async () => aContext, revoke, storage).generate(request(), randomUUID()), MediaUnavailable); }
  finally { await db.workspaceMember.create({ data: member }); }
});

test("storage saves UUID names, unchanged bytes, deletion/missing file; traversal and image validation", async () => {
  const key = await storage.save({ workspaceId: aContext.workspaceId, characterId: id, extension: "png", bytes: image });
  assert.match(key, /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.png$/);
  assert.deepEqual(await storage.read(key), image); await storage.delete(key); await storage.delete(key); await assert.rejects(storage.read(key), ImageError);
  for (const key of ["../.env", "../../file.png", "/etc/passwd", "C:\\Windows\\file", `${aContext.workspaceId}/${id}/../../../.env`]) for (const operation of [() => storage.read(key), () => storage.delete(key)]) await assert.rejects(operation, ImageError);
  await assert.rejects(storage.save({ workspaceId: "../", characterId: id, extension: "png", bytes: image }));
  for (const data of [Buffer.from("<svg>not allowed</svg>"), Buffer.alloc(maxImageBytes + 1), image.subarray(0, 40)]) await assert.rejects(inspectImage(data), ImageError);
  for (const extension of ["png", "jpeg", "webp"] as const) {
    const data = await sharp(image).toFormat(extension).toBuffer(); const details = await inspectImage(data); assert.equal(details.mimeType, extension === "jpeg" ? "image/jpeg" : `image/${extension}`);
  }
  assert.ok((await readdir(directory)).length > 0);
  // No test writes production files.
  assert.ok(directory.startsWith(tmpdir()));
});

test("real SDK wire contract mocked: base64, nearest size, reference multipart, safe failures, no retries", async () => {
  const keys = ["OPENAI_API_KEY", "OPENAI_IMAGE_MODEL", "OPENAI_BASE_URL", "OPENAI_IMAGE_REFERENCE_SUPPORTED", "OPENAI_IMAGE_SIZES"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { OPENAI_API_KEY: "test-image-key", OPENAI_IMAGE_MODEL: "test-image-model", OPENAI_BASE_URL: "https://compatible.example/v1", OPENAI_IMAGE_REFERENCE_SUPPORTED: "true", OPENAI_IMAGE_SIZES: "1024x1024,1024x1536,1536x1024" });
  let status = 200, malformed = false, expectedReferences = 1;
  const transport = mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    assert.ok(String(url).startsWith("https://compatible.example/v1/images/"));
    if (String(url).endsWith("edits")) {
      assert.ok(init.body instanceof FormData); const body = init.body as FormData; assert.equal(body.get("model"), "test-image-model"); assert.equal(body.get("size"), "1024x1536");
      const references = expectedReferences === 1 ? body.getAll("image") : body.getAll("image[]");
      assert.equal(references.length, expectedReferences); assert.ok(references.every((reference) => reference instanceof File));
    } else { const body = JSON.parse(String(init.body)); assert.equal(body.model, "test-image-model"); assert.equal(body.n, 1); assert.equal(body.size, "1536x1024"); }
    return new Response(JSON.stringify(status === 200 ? { data: [{ b64_json: malformed ? "INVALID!" : image.toString("base64") }] } : { error: { message: "secret upstream error" } }), { status, headers: { "content-type": "application/json" } });
  });
  const provider = new OpenAICompatibleImageProvider();
  try {
    assert.equal(provider.capabilities().referenceImages, true);
    assert.deepEqual((await provider.generateImage({ prompt: "scene", aspectRatio: "16:9" })).bytes, image);
    assert.equal((await provider.generateImage({ prompt: "scene", aspectRatio: "9:16", referenceImages: [{ bytes: image, mimeType: "image/png" }] })).referenceUsed, true);
    expectedReferences = 2;
    assert.equal((await provider.generateImage({ prompt: "scene", aspectRatio: "9:16", referenceImages: [{ bytes: image, mimeType: "image/png" }, { bytes: image, mimeType: "image/png" }] })).referenceUsed, true);
    malformed = true; await assert.rejects(provider.generateImage({ prompt: "scene", aspectRatio: "16:9" }), ImageError); malformed = false;
    for (const [http, code] of [[429, "rate_limit"], [401, "configuration"], [400, "provider"], [500, "provider"]]) {
      status = Number(http); const count = transport.mock.callCount(); await assert.rejects(provider.generateImage({ prompt: "scene", aspectRatio: "16:9" }), (e: unknown) => e instanceof ImageError && e.code === code); assert.equal(transport.mock.callCount(), count + 1);
    }
    delete process.env.OPENAI_IMAGE_MODEL; const calls = transport.mock.callCount(); await assert.rejects(provider.generateImage({ prompt: "x", aspectRatio: "1:1" }), ImageError); assert.equal(transport.mock.callCount(), calls);
    assert.ok(!(await readFile("src/features/media/generation-form.tsx", "utf8")).includes("OPENAI_"));
  } finally { transport.mock.restore(); for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } }
});
