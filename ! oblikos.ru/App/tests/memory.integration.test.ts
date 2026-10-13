import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "../src/db/client";
import { createMemoryService, MemoryUnavailable } from "../src/features/memory/operations";
import { createCharacterService } from "../src/features/characters/operations";
import { emptyCharacter } from "../src/features/characters/validation";
import { memorySchema } from "../src/features/memory/validation";

const db = getDatabase();
const users: string[] = [];
const workspaces: string[] = [];
let contextA: { userId: string; workspaceId: string };
let contextB: typeof contextA;
let id: string;
let otherId: string;
let sameWorkspaceId: string;
const a = createMemoryService(async () => contextA);
const b = createMemoryService(async () => contextB);
const characters = createCharacterService(async () => contextA);
const input = { type: "PREFERENCE", content: "  Любит кофе без сахара  ", importance: 3, isPinned: false };

before(async () => {
  for (const label of ["A", "B"]) {
    const marker = randomUUID();
    const user = await db.user.create({ data: { name: `Memory ${label}`, email: `memory-${marker}@example.com` } });
    users.push(user.id);
    const workspace = await db.workspace.create({ data: { name: `Memory ${label}`, slug: marker, members: { create: { userId: user.id, role: "OWNER" } } } });
    workspaces.push(workspace.id);
  }
  contextA = { userId: users[0], workspaceId: workspaces[0] };
  contextB = { userId: users[1], workspaceId: workspaces[1] };
  const source = await characters.create({ ...emptyCharacter, identity: { ...emptyCharacter.identity, name: "Память", gender: "Женский", ageRange: "25–34", niche: "Тест" } });
  id = source.id;
  otherId = (await db.character.create({ data: { workspaceId: workspaces[1], name: "Другой", slug: randomUUID() } })).id;
  sameWorkspaceId = (await db.character.create({ data: { workspaceId: workspaces[0], name: "Соседний", slug: randomUUID() } })).id;
});
after(async () => {
  try {
    const where = { character: { workspaceId: { in: workspaces } } };
    await db.memoryEntry.deleteMany({ where });
    await db.appearance.deleteMany({ where });
    await db.personality.deleteMany({ where });
    await db.character.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspaceMember.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  } finally { await db.$disconnect(); }
});

test("CRUD, trimmed content, defaults, pin/unpin and persistence", async () => {
  assert.equal((await a.list(id)).total, 0);
  const entry = await a.create(id, { type: "FACT", content: "  Факт  " });
  assert.equal(entry.content, "Факт"); assert.equal(entry.importance, 3); assert.equal(entry.isPinned, false);
  assert.equal((await a.get(id, entry.id)).characterId, id);
  const changed = await a.update(id, entry.id, input);
  assert.equal(changed.id, entry.id); assert.equal(changed.content, "Любит кофе без сахара");
  assert.equal(changed.type, "PREFERENCE"); assert.ok(changed.updatedAt >= entry.updatedAt);
  assert.equal((await a.pin(id, entry.id, true)).isPinned, true);
  assert.equal((await a.pin(id, entry.id, false)).isPinned, false);
  assert.equal((await db.memoryEntry.findUniqueOrThrow({ where: { id: entry.id } })).content, changed.content);
  await a.delete(id, entry.id);
  await assert.rejects(a.get(id, entry.id), MemoryUnavailable);
  assert.equal((await a.list(id)).total, 0);
});
test("server validation rejects empty/long content, invalid enum, importance and forged fields", async () => {
  for (const invalid of [
    { ...input, content: " \n\t " }, { ...input, content: "x".repeat(2001) }, { ...input, content: null },
    { ...input, type: "invalid" }, { ...input, type: undefined },
    ...[0, 6, 1.5, "3", NaN].map((importance) => ({ ...input, importance })),
    { ...input, isPinned: "true" }, { ...input, characterId: otherId }, { ...input, workspaceId: workspaces[1] },
  ]) await assert.rejects(a.create(id, invalid), z.ZodError);
  assert.equal(memorySchema.parse({ ...input, content: "x".repeat(2000) }).content.length, 2000);
  assert.equal((await a.list(id)).total, 0);
});
test("create retries use request UUID and concurrent double submission creates one row", async () => {
  const requestId = randomUUID();
  const pair = await Promise.all([a.create(id, input, requestId), a.create(id, input, requestId)]);
  assert.equal(pair[0].id, pair[1].id);
  assert.equal((await a.create(id, input, requestId)).id, requestId);
  assert.equal(await db.memoryEntry.count({ where: { id: requestId } }), 1);
  await assert.rejects(a.create(sameWorkspaceId, input, requestId), MemoryUnavailable);
  await a.delete(id, requestId);
});
test("workspace and character isolation covers every operation including forged memory IDs", async () => {
  const entry = await a.create(id, input);
  const foreign = await b.create(otherId, input);
  for (const [service, characterId, memoryId] of [[b, id, entry.id], [a, otherId, foreign.id], [a, sameWorkspaceId, entry.id], [a, id, foreign.id]] as const) {
    await assert.rejects(service.get(characterId, memoryId), MemoryUnavailable);
    await assert.rejects(service.update(characterId, memoryId, input), MemoryUnavailable);
    await assert.rejects(service.pin(characterId, memoryId, true), MemoryUnavailable);
    await assert.rejects(service.pin(characterId, memoryId, false), MemoryUnavailable);
    await assert.rejects(service.delete(characterId, memoryId), MemoryUnavailable);
  }
  for (const [service, characterId] of [[b, id], [a, otherId]] as const) {
    await assert.rejects(service.list(characterId), MemoryUnavailable);
    await assert.rejects(service.retrieve(characterId), MemoryUnavailable);
    await assert.rejects(service.create(characterId, input), MemoryUnavailable);
  }
  assert.equal((await a.get(id, entry.id)).isPinned, false);
  await db.workspaceMember.create({ data: { userId: users[0], workspaceId: workspaces[1] } });
  const selectedB = createMemoryService(async () => ({ userId: users[0], workspaceId: workspaces[1] }));
  await assert.rejects(selectedB.list(id), MemoryUnavailable);
  await assert.rejects(selectedB.create(id, input), MemoryUnavailable);
  await assert.rejects(selectedB.get(id, entry.id), MemoryUnavailable);
  await assert.rejects(selectedB.update(id, entry.id, input), MemoryUnavailable);
  await assert.rejects(selectedB.pin(id, entry.id, true), MemoryUnavailable);
  await assert.rejects(selectedB.delete(id, entry.id), MemoryUnavailable);
  assert.equal((await selectedB.list(otherId)).entries[0].id, foreign.id);
  await a.delete(id, entry.id);
});
test("sorting: pinned, importance, recency; type filtering; bounded retrieval and UI queries", async () => {
  const low = await a.create(id, { ...input, importance: 1, isPinned: true });
  const high = await a.create(id, { ...input, type: "RULE", importance: 5 });
  const old = await a.create(id, input);
  const recent = await a.create(id, input);
  await db.memoryEntry.update({ where: { id: old.id }, data: { updatedAt: new Date("2020-01-01") } });
  assert.deepEqual((await a.retrieve(id)).map((e) => e.id), [low.id, high.id, recent.id, old.id]);
  assert.equal((await a.retrieve(id, { limit: 2 })).length, 2);
  const filtered = await a.list(id, { type: "RULE", take: 1 });
  assert.equal(filtered.total, 4); assert.equal(filtered.filteredTotal, 1); assert.equal(filtered.entries[0].id, high.id);
  for (const limit of [0, 51, 1.5, "30"]) await assert.rejects(a.retrieve(id, { limit }), z.ZodError);
  await assert.rejects(a.list(id, { take: 101 }), z.ZodError);
  await assert.rejects(a.list(id, { type: "FAKE" }), z.ZodError);
});
test("duplicate preserves Character Core and starts with empty memory", async () => {
  assert.ok((await a.list(id)).total > 0);
  const copy = await characters.duplicate(id);
  assert.equal((await a.list(copy.id)).total, 0);
  assert.ok(copy.appearance); assert.ok(copy.personality);
  assert.ok((await a.list(id)).total > 0);
});
test("large memory collections use bounded queries and expose total without loading all rows", async () => {
  await db.memoryEntry.createMany({ data: Array.from({ length: 120 }, (_, index) => ({
    characterId: sameWorkspaceId, type: "FACT" as const, content: `Факт ${index}`, importance: 3,
  })) });
  assert.equal((await a.retrieve(sameWorkspaceId)).length, 30);
  assert.equal((await a.retrieve(sameWorkspaceId, { limit: 50 })).length, 50);
  const list = await a.list(sameWorkspaceId);
  assert.equal(list.total, 120); assert.equal(list.filteredTotal, 120); assert.equal(list.entries.length, 100);
  const subset = await a.list(sameWorkspaceId, { take: 5 });
  assert.equal(subset.entries.length, 5); assert.equal(subset.total, 120);
});
test("invalid IDs, missing records, invalid update/pin and anonymous resolver are denied", async () => {
  const entry = (await a.list(id)).entries[0];
  for (const invalid of ["bad-id", randomUUID()]) {
    await assert.rejects(a.list(invalid), MemoryUnavailable);
    await assert.rejects(a.retrieve(invalid), MemoryUnavailable);
    await assert.rejects(a.create(invalid, input), MemoryUnavailable);
    await assert.rejects(a.get(id, invalid), MemoryUnavailable);
    await assert.rejects(a.update(id, invalid, input), MemoryUnavailable);
    await assert.rejects(a.pin(id, invalid, true), MemoryUnavailable);
    await assert.rejects(a.delete(id, invalid), MemoryUnavailable);
  }
  await assert.rejects(a.update(id, entry.id, { ...input, content: " " }), z.ZodError);
  await assert.rejects(a.pin(id, entry.id, "true"), z.ZodError);
  const anonymous = createMemoryService(async () => { throw new Error("Unauthenticated"); });
  for (const operation of [() => anonymous.list(id), () => anonymous.retrieve(id), () => anonymous.create(id, input),
    () => anonymous.get(id, entry.id), () => anonymous.update(id, entry.id, input), () => anonymous.pin(id, entry.id, true), () => anonymous.delete(id, entry.id)]) {
    await assert.rejects(operation, /Unauthenticated/);
  }
});
test("soft-deleted character retains memory physically but denies every read and mutation", async () => {
  const entry = (await a.list(id)).entries[0];
  await characters.manage(id, "delete");
  assert.ok(await db.memoryEntry.count({ where: { characterId: id } }) > 0);
  for (const operation of [() => a.list(id), () => a.retrieve(id), () => a.create(id, input), () => a.get(id, entry.id),
    () => a.update(id, entry.id, input), () => a.pin(id, entry.id, false), () => a.delete(id, entry.id)]) await assert.rejects(operation, MemoryUnavailable);
});
test("membership is rechecked and database constraints/indexes enforce memory integrity", async () => {
  const entry = await b.create(otherId, input);
  await db.workspaceMember.delete({ where: { workspaceId_userId: contextB } });
  for (const operation of [() => b.list(otherId), () => b.retrieve(otherId), () => b.create(otherId, input),
    () => b.get(otherId, entry.id), () => b.update(otherId, entry.id, input), () => b.pin(otherId, entry.id, true), () => b.delete(otherId, entry.id)]) await assert.rejects(operation, MemoryUnavailable);
  await assert.rejects(db.memoryEntry.create({ data: { characterId: otherId, type: "FACT", content: "Test", importance: 6 } }));
  await assert.rejects(db.memoryEntry.create({ data: { characterId: otherId, type: "FACT", content: " " } }));
  await assert.rejects(db.memoryEntry.create({ data: { characterId: randomUUID(), type: "FACT", content: "Test" } }));
  const indexes = await db.$queryRaw<{ name: string }[]>`SELECT indexname AS name FROM pg_indexes WHERE schemaname=current_schema() AND tablename='MemoryEntry'`;
  assert.equal(indexes.length, 3);
});
