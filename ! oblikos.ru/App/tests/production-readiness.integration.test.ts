import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import path from "node:path";
import { getDatabase } from "../src/db/client";
import { createContentService } from "../src/features/content/operations";
import { createMediaService } from "../src/features/media/operations";
import { LocalStorageProvider } from "../src/features/media/storage";
import { reserveGeneration, GenerationSafetyError } from "../src/features/ai/safety";
import { mediaStorageDirectory, validateProductionEnvironment } from "../src/lib/server/environment";
import { FakeImageProvider } from "./fake-image-provider";

const db = getDatabase();
const original = { ...process.env };
let context: { userId: string; workspaceId: string };
let characterId: string;
let calls = 0;
const provider = { async generate() { calls++; return { body: "Сохранённый текст", provider: "offline", model: "offline" }; } };
const content = createContentService(async () => context, provider);
before(async () => {
  process.env.AUTH_SECRET = randomBytes(48).toString("hex");
  process.env.AI_GENERATION_ENABLED = "true";
  process.env.IMAGE_GENERATION_ENABLED = "true";
  const user = await db.user.create({ data: { name: "Readiness test" } });
  const workspace = await db.workspace.create({ data: { name: "Readiness test", slug: randomUUID(), members: { create: { userId: user.id } } } });
  context = { userId: user.id, workspaceId: workspace.id };
  characterId = (await db.character.create({ data: { workspaceId: workspace.id, name: "MVP", slug: randomUUID(), status: "ACTIVE" } })).id;
});
after(async () => {
  await db.contentGeneration.deleteMany({ where: { workspaceId: context.workspaceId } });
  await db.content.deleteMany({ where: { workspaceId: context.workspaceId } });
  await db.mediaGeneration.deleteMany({ where: { workspaceId: context.workspaceId } });
  await db.character.deleteMany({ where: { workspaceId: context.workspaceId } });
  await db.workspaceMember.deleteMany({ where: { workspaceId: context.workspaceId } });
  await db.workspace.delete({ where: { id: context.workspaceId } });
  await db.user.delete({ where: { id: context.userId } });
  await db.$disconnect();
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});
test("atomic simultaneous reservations; rejected requests do not reach provider; replay does not consume quota", async () => {
  process.env.AI_TEXT_PER_MINUTE = "2";
  process.env.AI_TEXT_PER_DAY = "3";
  process.env.AI_TEXT_GLOBAL_PER_DAY = "10";
  const request = { characterId, type: "POST", instruction: "Краткий пост" };
  const id = randomUUID();
  const saved = await content.generate(request, id);
  assert.equal((await content.generate(request, id)).id, saved.id);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => content.generate(request, randomUUID())));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(calls, 2);
  for (const r of results) if (r.status === "rejected") assert.ok(r.reason instanceof GenerationSafetyError);
  // Lift the minute window only; durable day counter still rejects fourth call.
  process.env.AI_TEXT_PER_MINUTE = "100";
  await content.generate(request, randomUUID());
  await assert.rejects(content.generate(request, randomUUID()), (e: unknown) => e instanceof GenerationSafetyError && e.code === "rate_limit");
  assert.equal(calls, 3);
});
test("global ceiling protects multiple identities; image switch and global switch fail before paid calls", async () => {
  process.env.AI_IMAGE_PER_MINUTE = "10";
  process.env.AI_IMAGE_PER_DAY = "10";
  process.env.AI_IMAGE_GLOBAL_PER_DAY = "1";
  await reserveGeneration("image", context);
  await assert.rejects(reserveGeneration("image", { userId: randomUUID(), workspaceId: randomUUID() }), GenerationSafetyError);
  process.env.IMAGE_GENERATION_ENABLED = "false";
  const fake = new FakeImageProvider();
  const service = createMediaService(async () => context, fake, new LocalStorageProvider());
  await assert.rejects(service.generate({ characterId, format: "PORTRAIT", aspectRatio: "1:1", instruction: "Фото" }, randomUUID()), (e: unknown) => e instanceof GenerationSafetyError && e.code === "disabled");
  assert.equal(fake.requests.length, 0);
  process.env.AI_GENERATION_ENABLED = "false";
  await assert.rejects(content.generate({ characterId, type: "POST", instruction: "Текст" }, randomUUID()), GenerationSafetyError);
  assert.equal((await content.list()).total, 3);
  assert.equal(calls, 3);
  process.env.AI_GENERATION_ENABLED = "invalid";
  await assert.rejects(reserveGeneration("text", context), (e: unknown) => e instanceof GenerationSafetyError && e.code === "configuration");
});
test("video quotas and kill switch reject requests before paid calls", async () => {
  process.env.AI_GENERATION_ENABLED = "true";
  process.env.VIDEO_GENERATION_ENABLED = "true";
  process.env.AI_VIDEO_PER_MINUTE = "1";
  process.env.AI_VIDEO_PER_DAY = "5";
  process.env.AI_VIDEO_GLOBAL_PER_DAY = "1";
  await reserveGeneration("video", context);
  await assert.rejects(reserveGeneration("video", context), (error: unknown) => error instanceof GenerationSafetyError && error.code === "rate_limit");
  await assert.rejects(reserveGeneration("video", { userId: randomUUID(), workspaceId: randomUUID() }), GenerationSafetyError);
  process.env.VIDEO_GENERATION_ENABLED = "false";
  await assert.rejects(reserveGeneration("video", context), (error: unknown) => error instanceof GenerationSafetyError && error.code === "disabled");
});
test("production env errors expose names only; relative/checkout/public/ephemeral media rejected", () => {
  for (const value of ["", "data/media", path.join(process.cwd(), "data", "media"), path.join(path.parse(process.cwd()).root, "public", "media")]) {
    assert.throws(() => mediaStorageDirectory(value, true));
  }
  const good = path.join(path.parse(process.cwd()).root, "var", "lib", "oblikos", "media");
  assert.equal(mediaStorageDirectory(good, true), good);
  process.env.DATABASE_URL = "secret-invalid-value";
  assert.throws(validateProductionEnvironment, (e: unknown) => e instanceof Error && !e.message.includes("secret-invalid-value"));
});
