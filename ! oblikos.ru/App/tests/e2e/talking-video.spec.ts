import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const email = `talking-browser-${randomUUID()}@example.com`;
test.afterAll(async () => {
  try {
    const rows = await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=$1', [email]);
    const ids = rows.rows.map((row) => row.workspaceId);
    const assets = await pool.query('SELECT "storageKey" FROM "MediaAsset" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    const root = path.resolve(process.cwd(), "artifacts", "media-e2e");
    for (const asset of assets.rows) { const file = path.resolve(root, asset.storageKey); if (!file.startsWith(root + path.sep)) throw new Error("Unsafe fixture path"); await unlink(file).catch(() => undefined); }
    for (const table of ["MediaGeneration", "MediaAsset", "VoicePreview"]) await pool.query(`DELETE FROM "${table}" WHERE "workspaceId"=ANY($1::uuid[])`, [ids]);
    for (const table of ["Appearance", "Personality"]) await pool.query(`DELETE FROM "${table}" WHERE "characterId" IN (SELECT id FROM "Character" WHERE "workspaceId"=ANY($1::uuid[]))`, [ids]);
    await pool.query('DELETE FROM "Character" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "WorkspaceMember" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "User" WHERE email=$1', [email]); await pool.query('DELETE FROM "Workspace" WHERE id=ANY($1::uuid[])', [ids]);
    for (const file of await readdir("artifacts/dev-mail").catch(() => [])) { const target = path.join("artifacts/dev-mail", file); if (JSON.parse(await readFile(target, "utf8")).to === email) await unlink(target); }
  } finally { await pool.end(); }
});
test("talking video: character voice, portrait, mobile, reload recovery and private playback", async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.goto("/register"); await page.getByLabel("Email", { exact: true }).fill(email);
  const password = `Talking-${randomUUID()}`;
  await page.getByLabel("Пароль", { exact: true }).fill(password); await page.getByLabel("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  const ws = (await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=$1', [email])).rows[0].workspaceId;
  const id = randomUUID();
  await pool.query('INSERT INTO "Character" (id,"workspaceId",name,slug,status,voice,"updatedAt") VALUES ($1,$2,$3,$5,\'ACTIVE\',$4,NOW())', [id, ws, "Говорящий персонаж", JSON.stringify({ voiceId: "gemini31:Kore", speed: "1", style: "Естественная", instructions: "" }), id]);
  await page.goto(`/characters/${id}/media`);
  await expect(page.getByRole("button", { name: "Создать говорящее видео", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сгенерировать", exact: true }).click(); await expect(page.locator(".media-card")).toHaveCount(1);
  await page.locator(".media-thumbnail").click(); await page.getByRole("button", { name: "Использовать как основной образ" }).click(); await expect(page.locator(".media-preview")).not.toBeVisible();
  await page.getByRole("button", { name: "Создать говорящее видео", exact: true }).click();
  const form = page.locator(".card.content-form").filter({ has: page.getByRole("heading", { name: "Говорящее видео", exact: true }) });
  await page.getByLabel("Текст речи", { exact: true }).fill("Привет! Я цифровой персонаж. Сегодня расскажу о своём проекте.");
  const primary = (await pool.query('SELECT id FROM "MediaAsset" WHERE "characterId"=$1 AND "isPrimaryReference"', [id])).rows[0].id;
  await form.getByRole("button", { name: "Новый образ", exact: true }).click();
  await form.getByLabel("Описание нового образа", { exact: true }).fill("Белая футболка, джинсы, микрофон в руке. Патриаршие пруды, дневной свет, кадр по пояс.");
  await expect(form.getByRole("button", { name: "Создать видео с речью", exact: true })).toBeDisabled();
  await form.getByRole("button", { name: "Сгенерировать образ для видео", exact: true }).click();
  await expect(form.getByRole("button", { name: "Использовать этот образ для видео", exact: true })).toBeVisible({ timeout: 30000 });
  const chosen = (await pool.query('SELECT id FROM "MediaAsset" WHERE "characterId"=$1 AND type=\'IMAGE\' AND NOT "isPrimaryReference"', [id])).rows[0].id;
  expect((await pool.query('SELECT count(*)::int AS n FROM "MediaGeneration" WHERE "characterId"=$1 AND type=\'VIDEO\'', [id])).rows[0].n).toBe(0);
  expect((await pool.query('SELECT count(*)::int AS n FROM "VoicePreview" WHERE "workspaceId"=$1', [ws])).rows[0].n).toBe(0);
  await expect(form.getByRole("button", { name: "Создать видео с речью", exact: true })).toBeDisabled();
  await page.reload();
  await expect(form.getByRole("button", { name: "Использовать этот образ для видео", exact: true })).toBeVisible();
  await expect(form.getByLabel("Текст речи", { exact: true })).toHaveValue("Привет! Я цифровой персонаж. Сегодня расскажу о своём проекте.");
  await expect(form.getByRole("button", { name: "Создать видео с речью", exact: true })).toBeDisabled();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Текст речи", { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `artifacts/talking-video-${width}.png` });
  }
  await form.getByRole("button", { name: "Использовать этот образ для видео", exact: true }).click();
  await form.locator(`button:has(img[src="/api/media/${primary}"])`).click();
  await expect(form.locator('.video-reference-choice[aria-pressed="true"] img')).toHaveAttribute("src", `/api/media/${primary}`);
  await form.locator(`button:has(img[src="/api/media/${chosen}"])`).click();
  await expect(form.locator('.video-reference-choice[aria-pressed="true"] img')).toHaveAttribute("src", `/api/media/${chosen}`);
  await page.reload();
  await expect(form.locator('.video-reference-choice[aria-pressed="true"] img')).toHaveAttribute("src", `/api/media/${chosen}`);
  await expect(form.getByRole("button", { name: "Создать видео с речью", exact: true })).toBeEnabled();
  for (const width of [1140, 390]) {
    await page.setViewportSize({ width, height: 884 });
    await form.scrollIntoViewIfNeeded();
    await form.screenshot({ path: `artifacts/talking-video-compact-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Создать видео с речью", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Видео создаётся", exact: true })).toBeVisible({ timeout: 20000 });
  await page.reload(); await expect(page.locator(".media-card")).toHaveCount(3, { timeout: 45000 });
  const generated = (await pool.query('SELECT * FROM "MediaAsset" WHERE "characterId"=$1 AND type=\'VIDEO\'', [id])).rows;
  expect(generated).toHaveLength(1); expect(generated[0].model).toBe("avatar-iv"); expect(generated[0].provider).toBe("aitunnel-avatar");
  expect(generated[0].referenceAssetId).toBe(chosen);
  expect((await pool.query('SELECT id FROM "MediaAsset" WHERE "characterId"=$1 AND "isPrimaryReference"', [id])).rows[0].id).toBe(primary);
  expect((await pool.query('SELECT count(*)::int AS n FROM "VoicePreview" WHERE "workspaceId"=$1', [ws])).rows[0].n).toBe(1);
  const file = await page.request.get(`/api/media/${generated[0].id}`); expect(file.status()).toBe(200); expect(file.headers()["content-type"]).toBe("video/mp4");
  await page.getByRole("button", { name: "Открыть видео персонажа Говорящий персонаж" }).click();
  await expect(page.locator(".media-preview video")).toHaveAttribute("controls", "");
  const other = await browser.newContext(); expect((await other.request.get(new URL(`/api/media/${generated[0].id}`, page.url()).href)).status()).not.toBe(200); await other.close();
});
