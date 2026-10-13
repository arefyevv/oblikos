import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 }), emails: string[] = [];
test.afterAll(async () => {
  try {
    const rows = await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=ANY($1::text[])', [emails]);
    const ids = rows.rows.map((r) => r.workspaceId);
    const assets = await pool.query('SELECT "storageKey" FROM "MediaAsset" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    for (const asset of assets.rows) await unlink(path.join(process.env.TEST_MEDIA_STORAGE_DIR || path.join(process.cwd(), "artifacts", "media-e2e"), asset.storageKey)).catch(() => undefined);
    for (const table of ["MediaGeneration", "MediaAsset", "ContentGeneration", "Content", "MemoryEntry", "Appearance", "Personality"]) await pool.query(`DELETE FROM "${table}" WHERE "characterId" IN (SELECT id FROM "Character" WHERE "workspaceId"=ANY($1::uuid[]))`, [ids]);
    await pool.query('DELETE FROM "Character" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "WorkspaceMember" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "User" WHERE email=ANY($1::text[])', [emails]);
    await pool.query('DELETE FROM "Workspace" WHERE id=ANY($1::uuid[])', [ids]);
    for (const file of await readdir("artifacts/dev-mail")) { const target = path.join("artifacts/dev-mail", file); if (emails.includes(JSON.parse(await readFile(target, "utf8")).to)) await unlink(target); }
  } finally { await pool.end(); }
});
test("offline video recovery, playback/ranges, responsive gallery, filtering, security, deletion and failed job", async ({ page, browser }) => {
  test.setTimeout(180000);
  const email = `video-e2e-${randomUUID()}@example.com`; emails.push(email);
  await page.goto("/register"); await page.getByLabel("Email", { exact: true }).fill(email);
  const password = `Video-password-${randomUUID()}`;
  await page.getByLabel("Пароль", { exact: true }).fill(password); await page.getByLabel("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  const ws = (await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=$1', [email])).rows[0].workspaceId;
  const id = randomUUID();
  await pool.query('INSERT INTO "Character" (id,"workspaceId",name,slug,status,"updatedAt") VALUES ($1,$2,\'Дарья Видео\',$3,\'ACTIVE\',NOW())', [id, ws, id]);
  await page.goto(`/characters/${id}/media`);
  await expect(page.getByRole("button", { name: "Создать видео", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сгенерировать", exact: true }).click(); await expect(page.locator(".media-card")).toHaveCount(1);
  await page.locator(".media-thumbnail").click(); await page.getByRole("button", { name: "Использовать как основной образ" }).click(); await expect(page.locator(".media-preview")).not.toBeVisible();
  await page.getByRole("button", { name: "Создать видео", exact: true }).click();
  await page.getByLabel("Описание сцены *").fill("Персонаж у окна");
  await page.getByLabel("Движение персонажа / действие").fill("Медленно поворачивает голову и улыбается.");
  await page.getByLabel("Длительность").selectOption("6");
  const primary = (await pool.query('SELECT id FROM "MediaAsset" WHERE "characterId"=$1 AND "isPrimaryReference"', [id])).rows[0].id;
  await page.getByRole("button", { name: "Сгенерировать видео", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Видео создаётся", exact: true })).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Видео создаётся", exact: true })).toBeVisible();
  const rows = (await pool.query('SELECT id,"providerJobId","referenceAssetId" FROM "MediaGeneration" WHERE "characterId"=$1 AND type=\'VIDEO\'', [id])).rows;
  expect(rows).toHaveLength(1); expect(rows[0].referenceAssetId).toBe(primary);
  expect(rows[0].providerJobId).toMatch(/^offline-\d+-ready$/);
  await page.reload(); await expect(page.getByRole("heading", { name: "Видео создаётся", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Видео создаётся", exact: true })).toBeVisible();
  await expect(page.locator(".media-card")).toHaveCount(2, { timeout: 25000 });
  const video = (await pool.query('SELECT id,"storageKey" FROM "MediaAsset" WHERE "characterId"=$1 AND type=\'VIDEO\'', [id])).rows[0];
  const bytes = await readFile("tests/fixtures/video.mp4");
  const full = await page.request.get(`/api/media/${video.id}`); expect(full.status()).toBe(200); expect(full.headers()["content-type"]).toBe("video/mp4"); expect(await full.body()).toEqual(bytes);
  for (const [range, start, end] of [["bytes=0-99", 0, 99], ["bytes=-100", bytes.length - 100, bytes.length - 1], [`bytes=${bytes.length - 100}-`, bytes.length - 100, bytes.length - 1]] as const) {
    const response = await page.request.get(`/api/media/${video.id}`, { headers: { Range: range } }); expect(response.status()).toBe(206); expect(response.headers()["accept-ranges"]).toBe("bytes"); expect(response.headers()["content-range"]).toBe(`bytes ${start}-${end}/${bytes.length}`); expect(Number(response.headers()["content-length"])).toBe(end - start + 1); expect(await response.body()).toEqual(bytes.subarray(start, end + 1));
  }
  for (const range of ["bytes=99999999-", "bytes=2-1", "bytes=0-1,3-4", "bytes=-0"]) expect((await page.request.get(`/api/media/${video.id}`, { headers: { Range: range } })).status()).toBe(416);
  const anon = await browser.newContext(); expect((await anon.request.get(`${new URL(page.url()).origin}/api/media/${video.id}`, { headers: { Range: "bytes=0-10" } })).status()).toBe(401); await anon.close();
  const other = await browser.newContext(), otherPage = await other.newPage();
  const foreignEmail = `foreign-video-e2e-${randomUUID()}@example.com`; emails.push(foreignEmail);
  await otherPage.goto(`${new URL(page.url()).origin}/register`); await otherPage.getByLabel("Email", { exact: true }).fill(foreignEmail);
  await otherPage.getByLabel("Пароль", { exact: true }).fill(password); await otherPage.getByLabel("Повторите пароль").fill(password);
  await otherPage.getByRole("button", { name: "Создать аккаунт", exact: true }).click(); await expect(otherPage).toHaveURL(/\/dashboard$/);
  expect((await other.request.get(`${new URL(page.url()).origin}/api/media/${video.id}`, { headers: { Range: "bytes=0-10" } })).status()).toBe(404); await other.close();
  const current = (await pool.query('SELECT "workspaceId" FROM "WorkspaceMember" WHERE "workspaceId"=$1', [ws])).rows[0]; expect(current.workspaceId).toBe(ws);
  const foreignId = randomUUID(); expect((await page.request.get(`/api/media/${foreignId}`)).status()).toBe(404);
  await page.goto(`/characters/${id}/media?type=VIDEO`); await expect(page.locator(".media-card")).toHaveCount(1);
  const headerPositions: Record<number, unknown> = {};
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    headerPositions[width] = await page.locator(".character-header").boundingBox();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Открыть видео персонажа Дарья Видео" }).click();
    const dialog = page.locator(".media-preview"), player = dialog.locator("video");
    await expect(dialog).toBeVisible(); await expect(player).toHaveAttribute("controls", ""); await expect(player).toHaveAttribute("preload", "metadata");
    await expect.poll(() => player.evaluate((el) => (el as HTMLVideoElement).readyState)).toBeGreaterThan(0);
    expect(await player.evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(320);
    await expect(dialog.getByRole("button", { name: "Использовать как основной образ" })).toHaveCount(0);
    await page.screenshot({ path: `artifacts/video-preview-${width}.png` });
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Открыть видео персонажа Дарья Видео" })).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.locator(".character-header").boundingBox()).toEqual(headerPositions[width]);
  }
  await page.goto("/media?type=VIDEO"); await expect(page.locator(".media-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Открыть видео персонажа Дарья Видео" }).click(); const dialog = page.locator(".media-preview");
  await dialog.getByRole("button", { name: "Удалить", exact: true }).click(); await dialog.getByRole("button", { name: "Отмена", exact: true }).click(); await expect(dialog.locator("video")).toBeVisible();
  await dialog.getByRole("button", { name: "Удалить", exact: true }).click(); await dialog.getByRole("button", { name: "Удалить видео", exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.reload(); await expect(page.locator(".media-card")).toHaveCount(0); expect((await page.request.get(`/api/media/${video.id}`)).status()).toBe(404);
  const failedId = randomUUID();
  await pool.query('INSERT INTO "MediaGeneration" (id,"workspaceId","characterId",fingerprint,status,type,provider,model,"providerJobId","referenceAssetId",prompt,scene,duration,"aspectRatio","nextPollAt","updatedAt") VALUES ($1,$2,$3,$4,\'PROCESSING\',\'VIDEO\',\'proxyapi-video\',\'kwaivgi/kling-v3.0-pro\',$5,$6,\'Offline failed prompt\',\'Отклонённая сцена\',6,\'16:9\',NOW(),NOW())', [failedId, ws, id, "b".repeat(64), `offline-${Date.now()}-failed`, primary]);
  await page.goto(`/characters/${id}/media`);
  await page.getByText(/^История генераций ·/).click();
  await expect(page.getByRole("heading", { name: "Не удалось создать видео.", exact: true })).toBeVisible();
  expect((await pool.query('SELECT "mediaId" FROM "MediaGeneration" WHERE id=$1', [failedId])).rows[0].mediaId).toBeNull();
  await page.screenshot({ path: "artifacts/video-failed-320.png" });
});
