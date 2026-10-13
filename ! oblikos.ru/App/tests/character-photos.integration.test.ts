import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { getDatabase } from "../src/db/client";
import { createPhotoCharacterService, createAppearancePhotoService, prepareCharacterPhotos, PhotoInputError } from "../src/features/characters/photo-operations";
import { CharacterUnavailable, CharacterPhotoLimit, createCharacterService } from "../src/features/characters/operations";
import { emptyCharacter } from "../src/features/characters/validation";
import { LocalStorageProvider } from "../src/features/media/storage";
import { createMediaService, MediaUnavailable } from "../src/features/media/operations";
import { FakeImageProvider } from "./fake-image-provider";

const db = getDatabase();
// Offline image fixtures must not consume the real local account's shared AI budget.
process.env.AUTH_SECRET = randomBytes(48).toString("base64url");
let context: { userId: string; workspaceId: string };
let directory: string, storage: LocalStorageProvider, image: Buffer;
const input = { ...emptyCharacter, identity: { ...emptyCharacter.identity, name: "Фото тест", gender: "Женский", ageRange: "25–34", niche: "Lifestyle" } };
const files = (count: number) => Array.from({ length: count }, (_, index) => new File([new Uint8Array(image)], `photo-${index}.png`, { type: "image/png" }));
const create = (id: string, count = 5) => createPhotoCharacterService(async () => context, storage)(input, id, files(count));

before(async () => {
  const user = await db.user.create({ data: { name: "Photo test", email: `photos-${randomUUID()}@example.com` } });
  const workspace = await db.workspace.create({ data: { name: "Photo test", slug: randomUUID(), members: { create: { userId: user.id, role: "OWNER" } } } });
  context = { userId: user.id, workspaceId: workspace.id };
  directory = await mkdtemp(path.join(tmpdir(), "oblikos-photos-"));
  storage = new LocalStorageProvider(directory);
  image = await sharp({ create: { width: 180, height: 240, channels: 3, background: "#d3c1aa" } }).png().toBuffer();
});
after(async () => {
  try {
    await db.mediaGeneration.deleteMany({ where: { workspaceId: context.workspaceId } });
    await db.mediaAsset.deleteMany({ where: { workspaceId: context.workspaceId } });
    await db.appearance.deleteMany({ where: { character: { workspaceId: context.workspaceId } } });
    await db.personality.deleteMany({ where: { character: { workspaceId: context.workspaceId } } });
    await db.character.deleteMany({ where: { workspaceId: context.workspaceId } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: context.workspaceId } });
    await db.workspace.delete({ where: { id: context.workspaceId } });
    await db.user.delete({ where: { id: context.userId } });
    await rm(directory, { recursive: true, force: true });
  } finally { await db.$disconnect(); }
});

test("photo limits, spoofed MIME and corrupt files are rejected before persistence", async () => {
  for (const selection of [[], files(11), [new File(["<svg>fake</svg>"], "fake.jpg", { type: "image/jpeg" })], [new File([new Uint8Array(1024 * 1024 + 1)], "large.jpg")]]) {
    await assert.rejects(prepareCharacterPhotos(selection), PhotoInputError);
  }
  assert.equal(await db.character.count({ where: { workspaceId: context.workspaceId } }), 0);
});
test("five photos are saved atomically; primary cover and retry are stable", async () => {
  const id = randomUUID();
  await create(id);
  const photos = await db.mediaAsset.findMany({ where: { characterId: id } });
  assert.equal(photos.length, 5);
  assert.equal(photos.filter((photo) => photo.isPrimaryReference).length, 1);
  assert.ok(photos.every((photo) => photo.provider === "user-upload" && photo.mimeType === "image/jpeg"));
  await create(id);
  assert.equal(await db.mediaAsset.count({ where: { characterId: id } }), 5);
  assert.equal((await readdir(path.join(directory, context.workspaceId, id))).length, 5);
  assert.equal((await createCharacterService(async () => context).list()).find((character) => character.id === id)?.mediaAssets.length, 1);
});
test("all ten references reach image generation, primary first, deleted references excluded", async () => {
  const id = randomUUID(); await create(id, 10);
  const provider = new FakeImageProvider();
  const service = createMediaService(async () => context, provider, storage);
  const request = { characterId: id, instruction: "Портрет", format: "PORTRAIT", aspectRatio: "1:1" };
  await service.generate(request, randomUUID());
  assert.equal(provider.requests[0].referenceImages?.length, 10);
  const primary = await service.primary(id);
  assert.ok(primary);
  assert.deepEqual(provider.requests[0].referenceImages![0].bytes, await storage.read(primary.storageKey));
  const second = (await service.list(id)).entries.find((photo) => photo.provider === "user-upload" && !photo.isPrimaryReference)!;
  await service.delete(second.id);
  await service.generate(request, randomUUID());
  assert.equal(provider.requests[1].referenceImages?.length, 9);
  const stranger = createMediaService(async () => ({ userId: randomUUID(), workspaceId: context.workspaceId }), provider, storage);
  await assert.rejects(stranger.read(primary.id), MediaUnavailable);
});
test("storage failure leaves neither a profile nor partial reference records", async () => {
  const id = randomUUID(); let calls = 0;
  const failing = { read: (key: string) => storage.read(key), delete: (key: string) => storage.delete(key), save: async (photo: Parameters<LocalStorageProvider["save"]>[0]) => { if (++calls === 2) throw new Error("Disk failure"); return storage.save(photo); } };
  await assert.rejects(createPhotoCharacterService(async () => context, failing)(input, id, files(5)), /Disk failure/);
  assert.equal(await db.character.count({ where: { id } }), 0);
  assert.equal(await db.mediaAsset.count({ where: { characterId: id } }), 0);
  assert.equal((await readdir(path.join(directory, context.workspaceId, id))).length, 0);
});
test("existing appearance: append photos atomically, replace cover, replay, total limit and isolation", async () => {
  const id = randomUUID(); await create(id, 5);
  const appearance = { ...emptyCharacter.appearance, visualDescription: "Новая внешность" };
  const append = createAppearancePhotoService(async () => context, storage);
  const requestId = randomUUID();
  await append(id, appearance, requestId, files(5));
  await append(id, appearance, requestId, files(5));
  assert.equal(await db.mediaAsset.count({ where: { characterId: id } }), 10);
  assert.equal((await readdir(path.join(directory, context.workspaceId, id))).length, 10);
  assert.equal((await db.mediaAsset.findFirst({ where: { characterId: id, isPrimaryReference: true } }))?.id, requestId);
  assert.equal((await createCharacterService(async () => context).get(id)).appearance?.visualDescription, "Новая внешность");
  await assert.rejects(append(id, { ...appearance, visualDescription: "Не сохранять" }, randomUUID(), files(1)), CharacterPhotoLimit);
  assert.equal((await createCharacterService(async () => context).get(id)).appearance?.visualDescription, "Новая внешность");
  assert.equal((await readdir(path.join(directory, context.workspaceId, id))).length, 10);
  await assert.rejects(createAppearancePhotoService(async () => ({ ...context, userId: randomUUID() }), storage)(id, appearance, randomUUID(), files(1)), CharacterUnavailable);
});
test("revoked membership fails closed and cleans up uploaded files", async () => {
  const id = randomUUID();
  const stranger = { ...context, userId: randomUUID() };
  await assert.rejects(createPhotoCharacterService(async () => stranger, storage)(input, id, files(1)), CharacterUnavailable);
  assert.equal(await db.character.count({ where: { id } }), 0);
  assert.equal((await readdir(path.join(directory, context.workspaceId, id))).length, 0);
});
