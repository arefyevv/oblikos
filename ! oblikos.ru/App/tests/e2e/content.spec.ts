import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const emails: string[] = [];
const password = `Content-e2e-${randomUUID()}`;
test.afterAll(async () => {
  try {
    const rows = await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=ANY($1::text[])', [emails]);
    const ids = rows.rows.map((r) => r.workspaceId);
    for (const table of ["ContentGeneration", "Content", "MemoryEntry", "Appearance", "Personality"]) await pool.query(`DELETE FROM "${table}" WHERE "characterId" IN (SELECT id FROM "Character" WHERE "workspaceId"=ANY($1::uuid[]))`, [ids]);
    await pool.query('DELETE FROM "Character" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "WorkspaceMember" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "User" WHERE email=ANY($1::text[])', [emails]);
    await pool.query('DELETE FROM "Workspace" WHERE id=ANY($1::uuid[])', [ids]);
    const directory = join(process.cwd(), "artifacts", "dev-mail");
    for (const file of await readdir(directory)) {
      const path = join(directory, file); const message = JSON.parse(await readFile(path, "utf8"));
      if (emails.includes(message.to)) await unlink(path);
    }
  } finally { await pool.end(); }
});

test("content flow: context, generate, reload, manual edit, regenerate, delete; global and character entry points; responsive", async ({ page, browser }) => {
  test.setTimeout(240000);
  const email = `content-e2e-${randomUUID()}@example.com`; emails.push(email);
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByLabel("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const member = (await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=$1', [email])).rows[0];
  const characterId = randomUUID();
  await pool.query('INSERT INTO "Character" (id,"workspaceId",name,slug,status,"updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',NOW())', [characterId, member.workspaceId, "Дарья Контент", characterId]);
  await pool.query('INSERT INTO "Personality" (id,"characterId",tone,"additionalInstructions","updatedAt") VALUES ($1,$2,\'Тёплый\',\'Без мата\',NOW())', [randomUUID(), characterId]);
  await page.goto(`/characters/${characterId}/memory`);
  await page.getByRole("button", { name: "Добавить воспоминание" }).click();
  const memoryDialog = page.getByRole("dialog");
  await memoryDialog.getByLabel("Тип", { exact: false }).selectOption("RULE");
  await memoryDialog.getByLabel("Содержание").fill("Не использует мат и любит краткость");
  await memoryDialog.getByLabel("Закрепить").check();
  await memoryDialog.getByRole("button", { name: "Сохранить воспоминание" }).click();
  await expect(memoryDialog).not.toBeVisible();
  await page.getByRole("link", { name: "Контент", exact: true }).last().click();
  const characterPath = `/characters/${characterId}/content`;
  await expect(page).toHaveURL(characterPath);
  await expect(page.getByRole("heading", { name: "Контента пока нет" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Создать контент" })).toHaveCount(1);
  const header = await page.locator(".character-header").boundingBox();
  for (const segment of ["", "/memory", "/content", "/history"]) {
    await page.goto(`/characters/${characterId}${segment}`);
    expect(await page.locator(".character-header").boundingBox()).toEqual(header);
  }
  await page.goto(characterPath);
  await page.getByRole("link", { name: "Создать контент" }).click();
  await expect(page.getByRole("combobox", { name: "Персонаж" })).toHaveCount(0);
  await expect(page.getByText("Дарья Контент", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сгенерировать", exact: true }).click();
  await expect(page.getByLabel("Задача / тема")).toBeFocused();
  await page.getByLabel("Тип контента").selectOption("POST");
  await page.getByLabel("Задача / тема").fill("Напиши пост о моём бренде");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "artifacts/content-generator-1440.png", fullPage: true });
  await page.getByRole("button", { name: "Сгенерировать", exact: true }).click();
  await expect(page.getByRole("button", { name: "Генерируем текст…" })).toBeDisabled();
  await expect(page).toHaveURL(/\/content\/[0-9a-f-]+$/);
  const editorPath = new URL(page.url()).pathname; const contentId = editorPath.split("/").at(-1)!;
  const generated = await page.getByLabel("Текст", { exact: true }).inputValue();
  expect(generated).toContain("Дарья Контент"); expect(generated).toContain("Не использует мат");
  expect((await pool.query('SELECT count(*)::int AS count FROM "Content" WHERE "characterId"=$1', [characterId])).rows[0].count).toBe(1);
  await page.reload(); await expect(page.getByLabel("Текст", { exact: true })).toHaveValue(generated);
  await page.getByLabel("Текст", { exact: true }).fill("Ручная правка. " + "Длинный текст без переносов".repeat(50));
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByRole("button", { name: "Сохранить изменения" })).toBeDisabled();
  await page.reload(); await expect(page.getByLabel("Текст", { exact: true })).toHaveValue(/Ручная правка/);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: "artifacts/content-editor-320.png", fullPage: true });
  await pool.query('INSERT INTO "MemoryEntry" (id,"characterId",type,content,"isPinned",importance,"updatedAt") VALUES ($1,$2,\'GOAL\',\'Новая цель после первой генерации\',true,5,NOW())', [randomUUID(), characterId]);
  await page.getByRole("button", { name: "Сгенерировать заново" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Отмена" })).toBeFocused();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(page.getByRole("button", { name: "Сгенерировать заново" })).toBeFocused();
  await page.getByRole("button", { name: "Сгенерировать заново" }).click();
  await dialog.getByRole("button", { name: "Заменить текст" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Сгенерировать заново" })).toBeFocused();
  await expect(page.getByLabel("Текст", { exact: true })).toHaveValue(/Новая цель после первой генерации/);
  await page.reload(); await expect(page.getByLabel("Текст", { exact: true })).toHaveValue(/Новая цель после первой генерации/);
  // Direct anonymous navigation is protected, and foreign workspace URLs disclose no content.
  const anonymous = await browser.newContext(); const visitor = await anonymous.newPage();
  await visitor.goto(new URL(editorPath, page.url()).href); await expect(visitor).toHaveURL(/\/login/); await anonymous.close();
  await page.goto("/content"); await expect(page.locator(".content-entry")).toHaveCount(1);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: "artifacts/content-list-320.png", fullPage: true });
  await page.getByRole("link", { name: "Создать контент" }).click();
  await expect(page.getByLabel("Персонаж", { exact: false })).toBeVisible(); await page.getByLabel("Персонаж", { exact: false }).selectOption(characterId);
  await page.goto(editorPath);
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Отмена" })).toBeFocused();
  await dialog.getByRole("button", { name: "Отмена" }).click(); await page.reload();
  await expect(page.getByLabel("Текст", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await dialog.getByRole("button", { name: "Удалить контент", exact: true }).click();
  await expect(page).toHaveURL(characterPath); await page.reload();
  await expect(page.getByRole("heading", { name: "Контента пока нет" })).toBeVisible();
  expect((await pool.query('SELECT count(*)::int AS count FROM "Content" WHERE id=$1', [contentId])).rows[0].count).toBe(0);
  // Archived/deleted characters are excluded from the global selector.
  await pool.query('UPDATE "Character" SET status=\'ARCHIVED\' WHERE id=$1', [characterId]);
  await page.reload(); await expect(page.getByRole("link", { name: "Создать контент" })).toHaveCount(0);
  await page.goto(`/content/new?characterId=${characterId}`); await expect(page.getByRole("heading", { name: "Персонаж в архиве" })).toBeVisible();
  await page.goto("/content/new"); await expect(page.getByRole("heading", { name: "Нужен персонаж" })).toBeVisible();
  await pool.query('UPDATE "Character" SET "deletedAt"=NOW() WHERE id=$1', [characterId]);
  await page.goto(`/content/new?characterId=${characterId}`); await expect(page.getByRole("button", { name: "Сгенерировать", exact: true })).toHaveCount(0);
});
