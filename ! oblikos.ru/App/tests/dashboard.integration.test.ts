import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../src/db/client";
import { createDashboardService } from "../src/features/dashboard/operations";

test("dashboard scopes records, hides deleted characters/assets, merges latest content and limits feeds", async () => {
  const db = getDatabase();
  const userIds: string[] = [], workspaceIds: string[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const user = await db.user.create({ data: { name: "Dashboard test", email: `dashboard-${randomUUID()}@example.com` } });
      userIds.push(user.id);
      const workspace = await db.workspace.create({ data: { name: "Dashboard test", slug: randomUUID(), members: { create: { userId: user.id } } } });
      workspaceIds.push(workspace.id);
    }
    const service = createDashboardService(async () => ({ userId: userIds[0], workspaceId: workspaceIds[0] }));
    assert.deepEqual(await service.get(), { hasCharacters: false, activity: [], content: [] });
    await assert.rejects(createDashboardService(async () => ({ userId: userIds[1], workspaceId: workspaceIds[0] })).get(), /WorkspaceUnavailable/);
    const old = new Date("2026-01-01T00:00:00Z"), newest = new Date("2026-10-06T12:00:00Z");
    const character = await db.character.create({ data: { workspaceId: workspaceIds[0], name: "Own character", slug: randomUUID(), createdAt: old, updatedAt: old } });
    const foreign = await db.character.create({ data: { workspaceId: workspaceIds[1], name: "Foreign character", slug: randomUUID() } });
    const deleted = await db.character.create({ data: { workspaceId: workspaceIds[0], name: "Deleted character", slug: randomUUID(), deletedAt: newest } });
    for (let i = 0; i < 7; i++) {
      const date = new Date(old.getTime() + i * 1000);
      await db.content.create({ data: { workspaceId: workspaceIds[0], characterId: character.id, type: "POST", instruction: "test", body: `Text ${i}`, provider: "test", model: "test", createdAt: date, updatedAt: date } });
    }
    for (const c of [foreign, deleted]) {
      await db.content.create({ data: { workspaceId: c.workspaceId, characterId: c.id, type: "POST", instruction: "test", body: "Hidden", provider: "test", model: "test", updatedAt: newest } });
    }
    const assetData = { workspaceId: workspaceIds[0], characterId: character.id, mimeType: "image/png", width: 1, height: 1, fileSize: 1, prompt: "test", provider: "test", model: "test", createdAt: newest };
    const asset = await db.mediaAsset.create({ data: { ...assetData, storageKey: `dashboard-test/${randomUUID()}` } });
    await db.mediaAsset.create({ data: { ...assetData, storageKey: `dashboard-test/${randomUUID()}`, deletedAt: newest } });
    const generation = await db.mediaGeneration.create({ data: { id: randomUUID(), workspaceId: workspaceIds[0], characterId: character.id, fingerprint: "test", type: "VIDEO", status: "FAILED", updatedAt: newest } });
    const result = await service.get();
    assert.equal(result.hasCharacters, true);
    assert.equal(result.content.length, 5);
    assert.equal(result.activity.length, 5);
    assert.equal(result.content[0].id, `media-${asset.id}`);
    assert.deepEqual(result.content.slice(1).map(entry => entry.description), ["Text 6", "Text 5", "Text 4", "Text 3"]);
    assert.equal(result.activity[0].id, `generation-${generation.id}`);
    assert.match(result.activity[0].title, /Ошибка генерации/);
    assert.ok([...result.activity, ...result.content].every(entry => !entry.title.includes("Foreign") && !entry.title.includes("Deleted") && entry.description !== "Hidden"));
    assert.ok([...result.activity, ...result.content].every(entry => entry.href.startsWith("/characters/") || entry.href.startsWith("/content/")));
  } finally {
    const where = { workspaceId: { in: workspaceIds } };
    await db.mediaGeneration.deleteMany({ where });
    await db.mediaAsset.deleteMany({ where });
    await db.content.deleteMany({ where });
    await db.character.deleteMany({ where });
    await db.workspaceMember.deleteMany({ where });
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
});
