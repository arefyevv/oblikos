import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../src/db/client";
import { createCharacterService, CharacterUnavailable } from "../src/features/characters/operations";
import { emptyCharacter, traitOptions, characterSchema } from "../src/features/characters/validation";

const db = getDatabase();
const marker = randomUUID();
const userIds: string[] = [];
const workspaceIds: string[] = [];
let contextA: { userId: string; workspaceId: string };
let contextB: typeof contextA;
const a = createCharacterService(async () => contextA);
const b = createCharacterService(async () => contextB);
const input = { identity: { ...emptyCharacter.identity, gender: "Женский", ageRange: "25–34", name: "Дарья", niche: "Своя ниша", biography: "Тестовая биография" }, appearance: { ...emptyCharacter.appearance, hairColor: "Рыжие", hairStyle: "Каре", clothingStyle: "Casual", visualDescription: "Веснушки", additionalInstructions: "Естественный образ" }, personality: { ...emptyCharacter.personality, tone: "Тёплый", traits: ["Любознательный" as const], description: "Исследователь", additionalInstructions: "Объяснять на примерах" } };
let id: string;
let copyId: string;

before(async () => {
  for (const label of ["A", "B"]) {
    const user = await db.user.create({ data: { name: `Character test ${label}`, email: `character-${label}-${marker}@example.com` } });
    userIds.push(user.id);
    const workspace = await db.workspace.create({ data: { name: `Test ${label}`, slug: `character-${label}-${marker}`, members: { create: { userId: user.id, role: "OWNER" } } } });
    workspaceIds.push(workspace.id);
  }
  contextA = { userId: userIds[0], workspaceId: workspaceIds[0] };
  contextB = { userId: userIds[1], workspaceId: workspaceIds[1] };
});
after(async () => {
  try {
    const where = { character: { workspaceId: { in: workspaceIds } } };
    await db.appearance.deleteMany({ where });
    await db.personality.deleteMany({ where });
    await db.character.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  } finally { await db.$disconnect(); }
});

test("empty workspace; atomic Character / Appearance / Personality creation and custom niche", async () => {
  assert.deepEqual(await a.list(), []);
  const record = await a.create(input);
  id = record.id;
  assert.equal(record.workspaceId, contextA.workspaceId);
  assert.equal(record.status, "ACTIVE");
  assert.equal(record.niche, "Своя ниша");
  assert.equal(record.appearance?.characterId, id);
  assert.equal(record.personality?.characterId, id);
  assert.equal(record.appearance?.hairColor, "Рыжие");
  assert.deepEqual(record.personality?.traits, ["Любознательный"]);
  assert.equal((await a.get(id)).biography, input.identity.biography);
  const persisted = await a.get(id);
  for (const [key, value] of Object.entries(input.appearance)) assert.equal(persisted.appearance?.[key as keyof typeof input.appearance], value);
  for (const [key, value] of Object.entries(input.personality)) assert.deepEqual(persisted.personality?.[key as keyof typeof input.personality], value);
  assert.equal((await a.list())[0].id, id);
});
test("invalid data and forged ownership rejected; no partial database records", async () => {
  const before = await db.character.count({ where: { workspaceId: contextA.workspaceId } });
  for (const invalid of [
    { ...input, identity: { ...input.identity, name: " " } },
    { ...input, personality: { ...input.personality, communicationStyle: "invalid" } },
    { ...input, workspaceId: contextB.workspaceId },
    { ...input, identity: { ...input.identity, workspaceId: contextB.workspaceId } },
    { ...input, appearance: { ...input.appearance, characterId: id } },
  ]) await assert.rejects(a.create(invalid));
  assert.equal(await db.character.count({ where: { workspaceId: contextA.workspaceId } }), before);
  assert.equal(await db.appearance.count({ where: { character: { workspaceId: contextA.workspaceId } } }), before);
  assert.equal(await db.personality.count({ where: { character: { workspaceId: contextA.workspaceId } } }), before);
});
test("all three layers persist independently; slug remains stable after identity update", async () => {
  const originalSlug = (await a.get(id)).slug;
  await a.update(id, "identity", { ...input.identity, name: "Дарья новая" });
  await a.update(id, "appearance", { ...input.appearance, hairColor: "Светлые" });
  await a.update(id, "personality", { ...input.personality, traits: ["Уверенный", "Эмпатичный"], tone: "Тёплый" });
  const record = await a.get(id);
  assert.equal(record.name, "Дарья новая");
  assert.equal(record.slug, originalSlug);
  assert.equal(record.appearance?.hairColor, "Светлые");
  assert.deepEqual(record.personality?.traits, ["Уверенный", "Эмпатичный"]);
  assert.equal(record.personality?.tone, "Тёплый");
});
test("required choices, trimmed text and trait limits are validated independently on server", async () => {
  assert.equal(emptyCharacter.identity.gender, "");
  assert.equal(emptyCharacter.identity.ageRange, "");
  for (const identity of [
    { ...input.identity, gender: "" }, { ...input.identity, gender: "Не указан" },
    { ...input.identity, ageRange: "" }, { ...input.identity, niche: "  " },
    { ...input.identity, name: "x".repeat(121) }, { ...input.identity, biography: "x".repeat(5001) },
  ]) {
    await assert.rejects(a.create({ ...input, identity }));
    await assert.rejects(a.update(id, "identity", identity));
  }
  for (const traits of [traitOptions, ["Уверенный", "Уверенный"], ["invalid"], "Уверенный", null]) {
    await assert.rejects(a.create({ ...input, personality: { ...input.personality, traits } }));
    await assert.rejects(a.update(id, "personality", { ...input.personality, traits }));
  }
  const valid = characterSchema.parse({ ...input, identity: { ...input.identity, name: "  Дарья  " }, personality: { ...input.personality, traits: traitOptions.slice(0, 7) } });
  assert.equal(valid.identity.name, "Дарья");
  assert.equal(valid.personality.traits.length, 7);
  await assert.rejects(a.update(id, "toString" as "identity", input.identity));
});
test("concurrent and retried creation uses one record and never crosses workspace or resurrects deleted data", async () => {
  const requestId = randomUUID();
  const records = await Promise.all([a.create(input, requestId), a.create(input, requestId)]);
  assert.equal(records[0].id, requestId);
  assert.equal(records[1].id, requestId);
  assert.equal((await a.create(input, requestId)).id, requestId);
  assert.equal(await db.character.count({ where: { id: requestId } }), 1);
  assert.equal(await db.appearance.count({ where: { characterId: requestId } }), 1);
  assert.equal(await db.personality.count({ where: { characterId: requestId } }), 1);
  await assert.rejects(b.create(input, requestId), CharacterUnavailable);
  await a.manage(requestId, "delete");
  await assert.rejects(a.create(input, requestId), CharacterUnavailable);
  await assert.rejects(a.create(input, "invalid"));
});
test("User B cannot list, read, update any layer, duplicate, archive, restore or delete A", async () => {
  assert.deepEqual(await b.list(), []);
  await assert.rejects(b.get(id), CharacterUnavailable);
  for (const section of ["identity", "appearance", "personality"] as const) await assert.rejects(b.update(id, section, input[section]), CharacterUnavailable);
  await assert.rejects(b.duplicate(id), CharacterUnavailable);
  for (const action of ["archive", "restore", "delete"] as const) await assert.rejects(b.manage(id, action), CharacterUnavailable);
  const forged = createCharacterService(async () => ({ userId: contextB.userId, workspaceId: contextA.workspaceId }));
  await assert.rejects(forged.create(input), CharacterUnavailable);
  await assert.rejects(forged.list(), CharacterUnavailable);
  await assert.rejects(forged.get(id), CharacterUnavailable);
  await assert.rejects(forged.update(id, "identity", input.identity), CharacterUnavailable);
  await assert.rejects(forged.duplicate(id), CharacterUnavailable);
  for (const action of ["archive", "restore", "delete"] as const) await assert.rejects(forged.manage(id, action), CharacterUnavailable);
  assert.equal((await a.get(id)).status, "ACTIVE");
});
test("duplicate creates independent layers, unique slug and resolves copy naming concurrently", async () => {
  await db.appearance.update({ where: { characterId: id }, data: { attributes: { secondary: "appearance fixture" } } });
  await db.personality.update({ where: { characterId: id }, data: { attributes: { secondary: "personality fixture" } } });
  const copies = await Promise.all([a.duplicate(id), a.duplicate(id)]);
  copyId = copies[0].id;
  assert.notEqual(copies[0].name, copies[1].name);
  assert.notEqual(copies[0].slug, copies[1].slug);
  const source = await a.get(id);
  assert.notEqual(copies[0].appearance?.id, source.appearance?.id);
  assert.notEqual(copies[0].personality?.id, source.personality?.id);
  assert.deepEqual(copies[0].personality?.traits, source.personality?.traits);
  assert.deepEqual(copies[0].appearance?.attributes, source.appearance?.attributes);
  assert.deepEqual(copies[0].personality?.attributes, source.personality?.attributes);
  assert.equal(copies[0].workspaceId, source.workspaceId);
  assert.equal(copies[0].status, "ACTIVE");
  assert.ok(copies[0].createdAt > source.createdAt);
  assert.ok(copies[0].updatedAt > source.updatedAt);
  for (const key of Object.keys(input.appearance) as (keyof typeof input.appearance)[]) assert.deepEqual(copies[0].appearance?.[key], source.appearance?.[key]);
  for (const key of Object.keys(input.personality) as (keyof typeof input.personality)[]) assert.deepEqual(copies[0].personality?.[key], source.personality?.[key]);
  await a.update(copyId, "appearance", { ...input.appearance, hairColor: "Чёрные" });
  assert.equal((await a.get(id)).appearance?.hairColor, "Светлые");
});
test("membership in another workspace cannot bypass the currently selected workspace scope", async () => {
  await db.workspaceMember.create({ data: { userId: contextA.userId, workspaceId: contextB.workspaceId } });
  const other = createCharacterService(async () => ({ userId: contextA.userId, workspaceId: contextB.workspaceId }));
  await assert.rejects(other.get(id), CharacterUnavailable);
  await assert.rejects(other.update(id, "identity", input.identity), CharacterUnavailable);
  await assert.rejects(other.duplicate(id), CharacterUnavailable);
  const character = await other.create(input);
  assert.equal(character.workspaceId, contextB.workspaceId);
  assert.ok(!(await other.list()).some((record) => record.id === id));
});
test("archive / restore filters and duplicate of archived character is ACTIVE", async () => {
  await a.manage(id, "archive");
  assert.equal((await a.get(id)).status, "ARCHIVED");
  assert.ok(!(await a.list("active")).some((c) => c.id === id));
  assert.ok((await a.list("archived")).some((c) => c.id === id));
  assert.equal((await a.duplicate(id)).status, "ACTIVE");
  await a.manage(id, "restore");
  assert.ok((await a.list("active")).some((c) => c.id === id));
});
test("soft delete preserves layers, excludes all reads and prevents subsequent mutations", async () => {
  await a.manage(id, "delete");
  assert.ok((await db.character.findUniqueOrThrow({ where: { id } })).deletedAt);
  assert.equal(await db.appearance.count({ where: { characterId: id } }), 1);
  assert.equal(await db.personality.count({ where: { characterId: id } }), 1);
  for (const filter of ["all", "active", "archived"] as const) assert.ok(!(await a.list(filter)).some((c) => c.id === id));
  await assert.rejects(a.get(id), CharacterUnavailable);
  await assert.rejects(a.duplicate(id), CharacterUnavailable);
  await assert.rejects(a.update(id, "identity", input.identity), CharacterUnavailable);
  for (const action of ["restore", "archive", "delete"] as const) await assert.rejects(a.manage(id, action), CharacterUnavailable);
  await assert.rejects(a.get("not-a-uuid"), CharacterUnavailable);
});
test("membership removal invalidates previously resolved context for every operation", async () => {
  await db.workspaceMember.delete({ where: { workspaceId_userId: contextA } });
  await assert.rejects(a.list(), CharacterUnavailable);
  await assert.rejects(a.get(copyId), CharacterUnavailable);
  await assert.rejects(a.create(input), CharacterUnavailable);
  await assert.rejects(a.update(copyId, "identity", input.identity), CharacterUnavailable);
  await assert.rejects(a.duplicate(copyId), CharacterUnavailable);
  for (const action of ["archive", "restore", "delete"] as const) await assert.rejects(a.manage(copyId, action), CharacterUnavailable);
});
test("Character relational constraints and indexes exist", async () => {
  const result = await db.$queryRaw<{ name: string }[]>`SELECT indexname AS name FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN ('Character_workspaceId_slug_key', 'Character_workspaceId_deletedAt_updatedAt_idx', 'Character_workspaceId_status_idx', 'Appearance_characterId_key', 'Personality_characterId_key') UNION ALL SELECT conname AS name FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conname IN ('Character_workspaceId_fkey', 'Appearance_characterId_fkey', 'Personality_characterId_fkey')`;
  assert.equal(result.length, 8);
});

