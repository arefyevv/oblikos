import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { unlink, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const emails: string[] = [];
test.afterAll(async () => {
  try {
    const rows = await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=ANY($1::text[])', [emails]);
    const ids = rows.rows.map((r) => r.workspaceId);
    const assets = await pool.query('SELECT "storageKey" FROM "MediaAsset" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    for (const asset of assets.rows) await unlink(path.join(process.cwd(), "artifacts", "media-e2e", asset.storageKey)).catch(() => undefined);
    for (const table of ["MediaGeneration", "MediaAsset", "ContentGeneration", "Content", "MemoryEntry", "Appearance", "Personality"]) await pool.query(`DELETE FROM "${table}" WHERE "characterId" IN (SELECT id FROM "Character" WHERE "workspaceId"=ANY($1::uuid[]))`, [ids]);
    await pool.query('DELETE FROM "Character" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "WorkspaceMember" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "User" WHERE email=ANY($1::text[])', [emails]);
    await pool.query('DELETE FROM "Workspace" WHERE id=ANY($1::uuid[])', [ids]);
    const directory = path.join(process.cwd(), "artifacts", "dev-mail");
    for (const file of await readdir(directory)) { const target = path.join(directory, file); if (emails.includes(JSON.parse(await readFile(target, "utf8")).to)) await unlink(target); }
  } finally { await pool.end(); }
});

test("visual identity: generate, primary, reload, second reference, gallery, delete, duplicate, isolation and responsive", async ({ page, browser }) => {
  test.setTimeout(240000);
  const email = `media-e2e-${randomUUID()}@example.com`; emails.push(email);
  const password = `Media-password-${randomUUID()}`;
  await page.goto("/register"); await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password); await page.getByLabel("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  const workspaceId = (await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=$1', [email])).rows[0].workspaceId;
  await page.goto("/media"); await expect(page.getByRole("heading", { name: "Медиатека пока пуста" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Создать персонажа", exact: true })).toHaveCount(1);
  const id = randomUUID();
  await pool.query('INSERT INTO "Character" (id,"workspaceId",name,slug,status,"updatedAt") VALUES ($1,$2,\'Дарья Образ\',$3,\'ACTIVE\',NOW())', [id, workspaceId, id]);
  await page.goto(`/characters/${id}/media`);
  await expect(page.locator(".media-gallery")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Создать образ", exact: true })).toBeVisible();
  const header = await page.locator(".character-header").boundingBox();
  for (const segment of ["", "/identity", "/appearance", "/media", "/memory", "/content"]) {
    await page.goto(`/characters/${id}${segment}`); expect(await page.locator(".character-header").boundingBox()).toEqual(header);
  }
  await page.goto(`/characters/${id}/media`);
  await page.getByLabel("Пожелания к первому изображению").fill("Мягкий свет, светлый фон");
  // Browser loses a committed success; same UUID must replay the one saved image.
  let release!: () => void;
  await page.route("**/*", async (route) => {
    if (route.request().headers()["next-action"]) {
      await route.fetch();
      await new Promise<void>((resolve) => { release = resolve; }); await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Сгенерировать", exact: true }).click();
  await expect(page.getByRole("button", { name: "Создаём изображение…" })).toBeDisabled();
  await expect.poll(() => Boolean(release)).toBe(true); release();
  await expect(page.locator('.media-generation [role="alert"]')).toContainText("Не удалось связаться с сервером");
  await page.unroute("**/*"); await page.getByRole("button", { name: "Сгенерировать", exact: true }).click();
  await expect(page.locator(".media-card")).toHaveCount(1);
  expect((await pool.query('SELECT count(*)::int AS count FROM "MediaAsset" WHERE "characterId"=$1', [id])).rows[0].count).toBe(1);
  const firstId = (await pool.query('SELECT id FROM "MediaAsset" WHERE "characterId"=$1', [id])).rows[0].id;
  await page.locator(".media-thumbnail").click(); const dialog = page.locator(".media-preview");
  await expect(dialog.getByRole("button", { name: "Закрыть" })).toBeFocused();
  await dialog.getByRole("button", { name: "Использовать как основной образ" }).click(); await expect(dialog).not.toBeVisible();
  await page.reload(); await expect(page.locator(".media-header-image img")).toHaveAttribute("src", `/api/media/${firstId}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.locator(".character-header").boundingBox()).toEqual(header);
  const file = await page.request.get(`/api/media/${firstId}`); expect(file.ok()).toBe(true); expect(file.headers()["cache-control"]).toBe("private, no-store"); expect(file.headers()["content-type"]).toBe("image/png");
  await page.getByLabel("Опишите сцену").fill("Кафе у окна. " + "Длиннаястрока".repeat(150));
  await page.getByLabel("Соотношение сторон").selectOption("16:9");
  await page.getByRole("button", { name: "Сгенерировать", exact: true }).click(); await expect(page.locator(".media-card")).toHaveCount(2);
  const second = (await pool.query('SELECT id,"referenceUsed","referenceAssetId" FROM "MediaAsset" WHERE "characterId"=$1 AND id<>$2', [id, firstId])).rows[0];
  expect(second.referenceUsed).toBe(true); expect(second.referenceAssetId).toBe(firstId);
  await page.locator(".media-thumbnail").first().click(); await dialog.getByRole("button", { name: "Использовать как основной образ" }).click();
  // Wait for the primary mutation/refresh before reload can cancel the action.
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".media-header-image img")).toHaveAttribute("src", `/api/media/${second.id}`);
  await page.reload(); await expect(page.locator(".media-header-image img")).toHaveAttribute("src", `/api/media/${second.id}`);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".media-card")).toHaveCount(2);
    await expect.poll(() => page.locator(".media-thumbnail img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/media-appearance-${width}.png`, fullPage: true });
    await page.locator(".media-thumbnail").first().click(); await expect(dialog).toBeVisible();
    await dialog.locator("summary").click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/media-preview-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(page.locator(".media-thumbnail").first()).toBeFocused();
  }
  await page.locator(".media-thumbnail").first().click(); await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(dialog.getByText(/основной образ персонажа/)).toBeVisible(); await expect(dialog.getByRole("button", { name: "Отмена" })).toBeFocused();
  await dialog.getByRole("button", { name: "Отмена" }).click(); await page.keyboard.press("Escape"); await page.reload(); await expect(page.locator(".media-card")).toHaveCount(2);
  await page.locator(".media-thumbnail").first().click(); await dialog.getByRole("button", { name: "Удалить", exact: true }).click(); await dialog.getByRole("button", { name: "Удалить изображение", exact: true }).click();
  await expect(page.locator(".media-card")).toHaveCount(1); await expect(page.locator(".media-header-image")).toHaveCount(0);
  expect((await page.request.get(`/api/media/${second.id}`)).status()).toBe(404);
  await page.goto("/media"); await expect(page.locator(".media-card")).toHaveCount(1); await expect(page.locator(".media-card").getByRole("link", { name: "Дарья Образ" })).toBeVisible();
  for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  await page.screenshot({ path: "artifacts/media-library-320.png", fullPage: true });
  const anonymous = await browser.newContext(); expect((await anonymous.request.get(new URL(`/api/media/${firstId}`, page.url()).href)).status()).toBe(401); await anonymous.close();
  const foreign = await browser.newContext(); const visitor = await foreign.newPage();
  const foreignEmail = `media-foreign-${randomUUID()}@example.com`; emails.push(foreignEmail);
  await visitor.goto(new URL("/register", page.url()).href); await visitor.getByLabel("Email", { exact: true }).fill(foreignEmail); await visitor.getByLabel("Пароль", { exact: true }).fill(password); await visitor.getByLabel("Повторите пароль").fill(password); await visitor.getByRole("button", { name: "Создать аккаунт", exact: true }).click(); await expect(visitor).toHaveURL(/\/dashboard$/);
  expect((await foreign.request.get(new URL(`/api/media/${firstId}`, page.url()).href)).status()).toBe(404); await visitor.goto(new URL("/media", page.url()).href); await expect(visitor.locator(".media-card")).toHaveCount(0); await foreign.close();
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`/characters/${id}/settings`);
  await page.getByRole("button", { name: "Дублировать персонажа", exact: true }).click(); await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  const copyId = new URL(page.url()).pathname.split("/").at(-1)!; expect(copyId).not.toBe(id);
  expect((await pool.query('SELECT count(*)::int AS count FROM "MediaAsset" WHERE "characterId"=$1', [copyId])).rows[0].count).toBe(0);
  await page.goto(`/characters/${copyId}/media`); await expect(page.locator(".media-card")).toHaveCount(0); await expect(page.locator(".media-header-image")).toHaveCount(0);
  await pool.query('UPDATE "Character" SET status=\'ARCHIVED\' WHERE id=$1', [id]); await page.goto(`/characters/${id}/media`); await expect(page.locator(".media-card")).toHaveCount(1); await expect(page.locator(".media-generation")).toHaveCount(0);
  await pool.query('UPDATE "Character" SET "deletedAt"=NOW() WHERE id=$1', [id]); expect((await page.request.get(`/api/media/${firstId}`)).status()).toBe(404);
});
