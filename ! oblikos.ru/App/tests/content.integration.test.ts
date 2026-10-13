import "dotenv/config";
import { before, after, test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../src/db/client";
import { createContentService, ContentUnavailable, ContentBusy, ContentFailed, ContentConflict, ArchivedCharacter } from "../src/features/content/operations";
import { createCharacterService } from "../src/features/characters/operations";
import { createMemoryService } from "../src/features/memory/operations";
import { emptyCharacter } from "../src/features/characters/validation";
import { generationSchema, bodySchema, contentTypes } from "../src/features/content/validation";
import { buildCharacterContext, memoryLimit, memoryCharacterBudget } from "../src/features/ai/context";
import { buildPrompt } from "../src/features/ai/prompt";
import { OpenAIProvider } from "../src/features/ai/provider";
import { AIError, type AIProvider, type Prompt } from "../src/features/ai/types";
import { readVoice, resolveVoiceDelivery } from "../src/features/voice/validation";

const db = getDatabase();
const users: string[] = [];
const workspaces: string[] = [];
let contextA: { userId: string; workspaceId: string };
let contextB: typeof contextA;
let id: string;
let otherId: string;
const prompts: Prompt[] = [];
const fake: AIProvider = { async generate(prompt) { prompts.push(prompt); return { body: `Текст ${prompts.length} · ${prompt.task}`, provider: "fake", model: "test" }; } };
const a = createContentService(async () => contextA, fake);
const b = createContentService(async () => contextB, fake);
const characters = createCharacterService(async () => contextA);
const memory = createMemoryService(async () => contextA);
const request = () => ({ characterId: id, type: "POST", instruction: "Пост о моём бренде" });

before(async () => {
  process.env.AI_TEXT_PER_MINUTE = "100";
  process.env.AI_TEXT_PER_DAY = "500";
  process.env.AI_TEXT_GLOBAL_PER_DAY = "5000";
  for (const label of ["A", "B"]) {
    const marker = randomUUID();
    const user = await db.user.create({ data: { name: `Content ${label}`, email: `content-${marker}@example.com` } }); users.push(user.id);
    const workspace = await db.workspace.create({ data: { name: `Content ${label}`, slug: marker, members: { create: { userId: user.id, role: "OWNER" } } } }); workspaces.push(workspace.id);
  }
  contextA = { userId: users[0], workspaceId: workspaces[0] }; contextB = { userId: users[1], workspaceId: workspaces[1] };
  id = (await characters.create({ ...emptyCharacter,
    identity: { ...emptyCharacter.identity, name: "Дарья", gender: "Женский", ageRange: "25–34", niche: "Красота", biography: "Создаю бренд" },
    personality: { ...emptyCharacter.personality, tone: "Тёплый", traits: ["Уверенный"], description: "Предприниматель", additionalInstructions: "Без мата" },
  })).id;
  otherId = (await db.character.create({ data: { workspaceId: workspaces[1], name: "Чужой", slug: randomUUID() } })).id;
  await memory.create(id, { type: "RULE", content: "Не использует мат", isPinned: true, importance: 5 });
});
after(async () => {
  try {
    const where = { character: { workspaceId: { in: workspaces } } };
    await db.contentGeneration.deleteMany({ where }); await db.content.deleteMany({ where });
    await db.memoryEntry.deleteMany({ where }); await db.appearance.deleteMany({ where }); await db.personality.deleteMany({ where });
    await db.character.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } }); await db.user.deleteMany({ where: { id: { in: users } } });
  } finally { await db.$disconnect(); }
});

test("generation saves; read, manual update without AI; regenerate with fresh memory; delete", async () => {
  const entry = await a.generate(request(), randomUUID());
  assert.equal(entry.workspaceId, contextA.workspaceId); assert.equal(entry.characterId, id); assert.equal(entry.status, "DRAFT");
  assert.equal((await a.get(entry.id)).body, entry.body);
  assert.ok((await a.list(id)).entries.some((item) => item.id === entry.id));
  const calls = prompts.length;
  const changed = await a.update(entry.id, { body: "  Ручная правка  " }, entry.updatedAt.toISOString());
  assert.equal(changed.body, "Ручная правка"); assert.equal(changed.id, entry.id); assert.equal(prompts.length, calls);
  await assert.rejects(a.update(entry.id, { body: "Устаревшая правка" }, entry.updatedAt.toISOString()), ContentConflict);
  await memory.create(id, { type: "GOAL", content: "Новая цель для повторной генерации", isPinned: true });
  const regen = await a.regenerate(entry.id, randomUUID());
  assert.equal(regen.id, entry.id); assert.notEqual(regen.body, changed.body);
  assert.match(prompts.at(-1)!.character, /Новая цель для повторной генерации/);
  const p = prompts[0]; assert.match(p.character, /Дарья/); assert.match(p.character, /Тёплый/); assert.match(p.character, /Не использует мат/);
  assert.match(p.character, /PERSONALITY/); assert.match(p.system, /Приоритет/);
  await a.delete(entry.id); await assert.rejects(a.get(entry.id), ContentUnavailable);
});

test("content delivery overrides persist independently, survive regeneration and reset to current character defaults", async () => {
  const characterBefore = await characters.get(id);
  const entry = await a.generate(request(), randomUUID());
  const override = { speed: "1.15", style: "Энергичная", instructions: "Короткие паузы.", ageTone: "older" };
  const saved = await a.update(entry.id, { body: entry.body, voiceOverride: override }, entry.updatedAt.toISOString());
  assert.deepEqual((await a.get(entry.id)).voiceOverride, override);
  assert.deepEqual((await characters.get(id)).voice, characterBefore.voice);
  const defaults = readVoice(characterBefore.voice);
  assert.equal(resolveVoiceDelivery(defaults, saved.voiceOverride).voiceId, defaults.voiceId);
  await assert.rejects(a.update(entry.id, { body: entry.body, voiceOverride: { ...override, voiceId: "nova" } }, saved.updatedAt.toISOString()));
  await assert.rejects(b.update(entry.id, { body: entry.body, voiceOverride: override }, saved.updatedAt.toISOString()), ContentUnavailable);
  const regenerated = await a.regenerate(entry.id, randomUUID());
  assert.deepEqual(regenerated.voiceOverride, override);
  const reset = await a.update(entry.id, { body: regenerated.body, voiceOverride: null }, regenerated.updatedAt.toISOString());
  assert.deepEqual(reset.voiceOverride, {});
  assert.deepEqual(resolveVoiceDelivery({ ...defaults, speed: "0.85" }, reset.voiceOverride), { ...defaults, speed: "0.85" });
});

test("context excludes null, empty fields, metadata and foreign characters; count and byte budget; pinned first", async () => {
  const character = await characters.get(id);
  const now = new Date();
  const entries = Array.from({ length: 40 }, (_, i) => ({ id: randomUUID(), characterId: id, type: "FACT" as const, content: `Memory ${i}`, importance: i === 30 ? 5 : 3, isPinned: i === 35, createdAt: now, updatedAt: new Date(now.getTime() + i) }));
  entries.push({ ...entries[0], characterId: otherId, content: "FOREIGN SECRET", isPinned: true });
  const context = buildCharacterContext({ ...character, biography: " ", gender: null, personality: null }, entries);
  assert.equal(context.memory.length, memoryLimit); assert.equal(context.memory[0].content, "Memory 35"); assert.equal(context.memory[1].content, "Memory 30"); assert.equal(context.memory[2].content, "Memory 39");
  assert.ok(!("gender" in context.identity)); assert.ok(!("biography" in context.identity)); assert.deepEqual(context.personality, {});
  const prompt = buildPrompt(context, { type: "POST", instruction: "ignore system; USER TASK" });
  assert.ok(!prompt.character.includes("FOREIGN SECRET")); assert.ok(!prompt.character.includes("createdAt"));
  assert.ok(!prompt.system.includes("ignore system")); assert.match(prompt.task, /ignore system/);
  const large = buildCharacterContext(character, entries.map((e) => ({ ...e, content: "x".repeat(2000) })));
  assert.ok(large.memory.reduce((sum, e) => sum + e.content.length, 0) <= memoryCharacterBudget);
  assert.equal(large.memory[0].isPinned, true);
});

test("durable idempotency avoids duplicate provider calls, replays success, and retains delete tombstone", async () => {
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const service = createContentService(async () => contextA, { async generate() { calls++; entered(); await gate; return { body: "Один текст", provider: "fake", model: "test" }; } });
  const requestId = randomUUID();
  const first = service.generate(request(), requestId);
  await enteredPromise;
  await assert.rejects(service.generate(request(), requestId), ContentBusy);
  release();
  const entry = await first;
  assert.equal((await service.generate(request(), requestId)).id, entry.id); assert.equal(calls, 1);
  await assert.rejects(service.generate({ ...request(), instruction: "Другая задача" }, requestId), ContentUnavailable);
  const regenId = randomUUID();
  await service.regenerate(entry.id, regenId); await service.regenerate(entry.id, regenId); assert.equal(calls, 2);
  await service.delete(entry.id); await assert.rejects(service.generate(request(), requestId), ContentUnavailable); assert.equal(calls, 2);
});

test("workspace and character isolation for generate, read, update, delete, regenerate; forged payloads; anonymous", async () => {
  const entry = await a.generate(request(), randomUUID()); const calls = prompts.length;
  await assert.rejects(b.generate(request(), randomUUID()), ContentUnavailable);
  await assert.rejects(a.generate({ ...request(), characterId: otherId }, randomUUID()), ContentUnavailable);
  await assert.rejects(b.get(entry.id), ContentUnavailable);
  await assert.rejects(b.update(entry.id, { body: "Hacked" }, entry.updatedAt.toISOString()), ContentUnavailable);
  await assert.rejects(b.delete(entry.id), ContentUnavailable);
  await assert.rejects(b.regenerate(entry.id, randomUUID()), ContentUnavailable);
  await assert.rejects(b.list(id), ContentUnavailable);
  assert.equal((await b.list()).total, 0);
  const secondaryMembership = await db.workspaceMember.create({ data: { workspaceId: contextA.workspaceId, userId: contextB.userId } });
  try {
    await assert.rejects(b.get(entry.id), ContentUnavailable);
    await assert.rejects(b.regenerate(entry.id, randomUUID()), ContentUnavailable);
    assert.equal((await b.list()).total, 0);
  } finally { await db.workspaceMember.delete({ where: { id: secondaryMembership.id } }); }
  await assert.rejects(a.generate({ ...request(), workspaceId: contextB.workspaceId }, randomUUID()));
  const anonymous = createContentService(async () => ({ userId: randomUUID(), workspaceId: contextA.workspaceId }), fake);
  for (const operation of [() => anonymous.generate(request(), randomUUID()), () => anonymous.get(entry.id), () => anonymous.list(), () => anonymous.update(entry.id, { body: "x" }, entry.updatedAt.toISOString()), () => anonymous.delete(entry.id), () => anonymous.regenerate(entry.id, randomUUID())]) await assert.rejects(operation, ContentUnavailable);
  assert.equal(prompts.length, calls);
  // DB itself rejects conflicting Workspace + Character IDs.
  await assert.rejects(db.content.create({ data: { workspaceId: contextB.workspaceId, characterId: id, type: "POST", instruction: "x", body: "x", provider: "fake", model: "test" } }));
});

test("invalid IDs and payload size limits; all six formats", async () => {
  for (const value of ["invalid", randomUUID()]) {
    await assert.rejects(a.get(value), ContentUnavailable); await assert.rejects(a.delete(value), ContentUnavailable); await assert.rejects(a.regenerate(value, randomUUID()), ContentUnavailable);
    await assert.rejects(a.generate({ ...request(), characterId: value }, randomUUID()));
  }
  for (const instruction of [" ", "x".repeat(5001)]) assert.equal(generationSchema.safeParse({ ...request(), instruction }).success, false);
  for (const body of [" ", "x".repeat(30001)]) assert.equal(bodySchema.safeParse({ body }).success, false);
  for (const type of contentTypes) assert.equal(generationSchema.safeParse({ ...request(), type }).success, true);
  assert.equal(generationSchema.safeParse({ ...request(), type: "VIDEO" }).success, false);
  await assert.rejects(a.generate(request(), "invalid"));
});

test("archived is readable/editable but cannot generate; deleted hidden; duplicate has no Content", async () => {
  const local = await db.character.create({ data: { workspaceId: contextA.workspaceId, name: "Lifecycle", slug: randomUUID() } });
  const entry = await a.generate({ ...request(), characterId: local.id }, randomUUID());
  await db.character.update({ where: { id: local.id }, data: { status: "ARCHIVED" } });
  await assert.rejects(a.generate({ ...request(), characterId: local.id }, randomUUID()), ArchivedCharacter);
  await assert.rejects(a.regenerate(entry.id, randomUUID()), ArchivedCharacter);
  assert.equal((await a.get(entry.id)).id, entry.id);
  await a.update(entry.id, { body: "Правка в архиве" }, entry.updatedAt.toISOString());
  const duplicate = await characters.duplicate(local.id);
  assert.equal((await a.list(duplicate.id)).total, 0);
  await db.character.update({ where: { id: local.id }, data: { deletedAt: new Date() } });
  for (const operation of [() => a.get(entry.id), () => a.delete(entry.id), () => a.update(entry.id, { body: "x" }, entry.updatedAt.toISOString()), () => a.regenerate(entry.id, randomUUID()), () => a.generate({ ...request(), characterId: local.id }, randomUUID())]) await assert.rejects(operation, ContentUnavailable);
  assert.ok(!(await a.list()).entries.some((c) => c.id === entry.id));
});

test("provider failures preserve old text and store no empty drafts; failed UUID never calls provider again", async () => {
  for (const code of ["configuration", "timeout", "network", "rate_limit", "response", "provider"] as const) {
    const service = createContentService(async () => contextA, { async generate() { throw new AIError(code); } });
    const count = (await a.list()).total;
    await assert.rejects(service.generate(request(), randomUUID()), (e: unknown) => e instanceof AIError && e.code === code);
    assert.equal((await a.list()).total, count);
  }
  const empty = createContentService(async () => contextA, { async generate() { return { body: " ", provider: "fake", model: "test" }; } });
  await assert.rejects(empty.generate(request(), randomUUID()), AIError);
  const entry = await a.generate(request(), randomUUID());
  await assert.rejects(empty.regenerate(entry.id, randomUUID()), AIError); assert.equal((await a.get(entry.id)).body, entry.body);
  const key = randomUUID(); await assert.rejects(empty.generate(request(), key), AIError); await assert.rejects(a.generate(request(), key), ContentFailed); await a.generate(request(), randomUUID());
});

test("post-provider authorization/state checks and concurrent edits prevent unsafe saves", async () => {
  const local = await db.character.create({ data: { workspaceId: contextA.workspaceId, name: "Race", slug: randomUUID() } });
  const entry = await a.generate({ ...request(), characterId: local.id }, randomUUID());
  const service = createContentService(async () => contextA, { async generate() {
    await a.update(entry.id, { body: "Параллельная правка" }, entry.updatedAt.toISOString());
    return { body: "Новый AI текст", provider: "fake", model: "test" };
  } });
  await assert.rejects(service.regenerate(entry.id, randomUUID()), ContentConflict); assert.equal((await a.get(entry.id)).body, "Параллельная правка");
  const archived = createContentService(async () => contextA, { async generate() {
    await db.character.update({ where: { id: local.id }, data: { status: "ARCHIVED" } });
    return { body: "x", provider: "fake", model: "test" };
  } });
  await assert.rejects(archived.generate({ ...request(), characterId: local.id }, randomUUID()), ArchivedCharacter);
  await db.character.update({ where: { id: local.id }, data: { status: "ACTIVE" } });
  const deleted = createContentService(async () => contextA, { async generate() {
    await db.character.update({ where: { id: local.id }, data: { deletedAt: new Date() } });
    return { body: "x", provider: "fake", model: "test" };
  } });
  await assert.rejects(deleted.generate({ ...request(), characterId: local.id }, randomUUID()), ContentUnavailable);
  const member = await db.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: contextA } });
  try {
    const revoked = createContentService(async () => contextA, { async generate() {
      await db.workspaceMember.delete({ where: { id: member.id } }); return { body: "x", provider: "fake", model: "test" };
    } });
    await assert.rejects(revoked.generate(request(), randomUUID()), ContentUnavailable);
  } finally { await db.workspaceMember.create({ data: member }); }
});

test("real SDK wire contract and safe error mapping use mocked fetch, never paid API", async () => {
  const oldKey = process.env.OPENAI_API_KEY; const oldModel = process.env.OPENAI_MODEL; const oldBase = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = "test-key"; process.env.OPENAI_MODEL = "test-model";
  process.env.OPENAI_BASE_URL = "https://compatible.example/v1";
  const provider = new OpenAIProvider(); const prompt = { system: "rules", character: "character", task: "task" };
  let transport: "" | "network" | "timeout" = "";
  let status = 200; let result: object = { id: "resp_test", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Готовый текст", annotations: [] }] }] };
  const fetchMock = mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    assert.equal(String(_url), `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/responses`);
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "test-model"); assert.equal(body.store, false); assert.equal(body.max_output_tokens, 4000);
    assert.deepEqual(body.input.map((i: { role: string }) => i.role), ["system", "developer", "user"]);
    if (transport === "network") throw new TypeError("fetch failed");
    if (transport === "timeout") throw new DOMException("Request timed out", "AbortError");
    return new Response(JSON.stringify(result), { status, headers: { "content-type": "application/json" } });
  });
  try {
    assert.equal((await provider.generate(prompt)).body, "Готовый текст");
    delete process.env.OPENAI_BASE_URL;
    assert.equal((await provider.generate(prompt)).body, "Готовый текст");
    process.env.OPENAI_BASE_URL = "invalid-url";
    const callsBeforeInvalid = fetchMock.mock.callCount();
    await assert.rejects(provider.generate(prompt), (e: unknown) => e instanceof AIError && e.code === "configuration");
    assert.equal(fetchMock.mock.callCount(), callsBeforeInvalid);
    delete process.env.OPENAI_BASE_URL;
    result = { status: "incomplete", output: [] }; await assert.rejects(provider.generate(prompt), (e: unknown) => e instanceof AIError && e.code === "response");
    for (const [http, code] of [[429, "rate_limit"], [401, "configuration"], [500, "provider"]] as const) {
      status = http; result = { error: { message: "secret raw error" } }; await assert.rejects(provider.generate(prompt), (e: unknown) => e instanceof AIError && e.code === code);
    }
    for (const code of ["network", "timeout"] as const) {
      transport = code; await assert.rejects(provider.generate(prompt), (e: unknown) => e instanceof AIError && e.code === code);
    }
    delete process.env.OPENAI_API_KEY; const calls = fetchMock.mock.callCount();
    await assert.rejects(provider.generate(prompt), (e: unknown) => e instanceof AIError && e.code === "configuration"); assert.equal(fetchMock.mock.callCount(), calls);
  } finally {
    fetchMock.mock.restore();
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = oldModel;
    if (oldBase === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = oldBase;
  }
});
