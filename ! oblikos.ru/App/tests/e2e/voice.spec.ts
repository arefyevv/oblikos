import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const emails: string[] = [];
test.afterAll(async () => {
  const users = (await pool.query('SELECT id FROM "User" WHERE email=ANY($1::text[])', [emails])).rows.map(r => r.id);
  const workspaces = (await pool.query('SELECT "workspaceId" FROM "WorkspaceMember" WHERE "userId"=ANY($1::uuid[])', [users])).rows.map(r => r.workspaceId);
  await pool.query('DELETE FROM "VoicePreview" WHERE "userId"=ANY($1::uuid[])', [users]);
  for (const table of ["Appearance", "Personality"]) await pool.query(`DELETE FROM "${table}" WHERE "characterId" IN (SELECT id FROM "Character" WHERE "workspaceId"=ANY($1::uuid[]))`, [workspaces]);
  await pool.query('DELETE FROM "Character" WHERE "workspaceId"=ANY($1::uuid[])', [workspaces]);
  await pool.query('DELETE FROM "WorkspaceMember" WHERE "workspaceId"=ANY($1::uuid[])', [workspaces]);
  await pool.query('DELETE FROM "User" WHERE id=ANY($1::uuid[])', [users]);
  await pool.query('DELETE FROM "Workspace" WHERE id=ANY($1::uuid[])', [workspaces]);
  for (const file of await readdir("artifacts/dev-mail")) {
    const target = path.join("artifacts/dev-mail", file);
    if (emails.includes(JSON.parse(await readFile(target, "utf8")).to)) await unlink(target);
  }
  await pool.end();
});
test("create with voice, play preview, persist edits and responsive voice section", async ({ page, browser }) => {
  test.setTimeout(120000);
  const email = `voice-e2e-${randomUUID()}@example.com`, password = `Voice-password-${randomUUID()}`; emails.push(email);
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Пароль", { exact: true }).fill(password); await page.getByLabel("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  await page.goto("/characters/new");
  await page.getByLabel("Имя персонажа").fill("Дарья — голос блога"); await page.getByLabel("Пол", { exact: false }).selectOption("Женский"); await page.getByLabel("Возраст").selectOption("25–34"); await page.getByLabel("Ниша / тематика").selectOption("Lifestyle");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Голос", exact: true })).toBeVisible();
  await page.getByLabel("Голос персонажа", { exact: true }).selectOption("nova"); await page.getByLabel("Темп речи").selectOption("0.85"); await page.getByLabel("Манера речи").selectOption("Тёплая");
  await page.getByRole("button", { name: "Послушать голос", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Образец готов", { timeout: 15000 });
  const audio = page.locator("audio");
  await expect.poll(async () => audio.evaluate((v: HTMLAudioElement) => v.readyState)).toBeGreaterThanOrEqual(1);
  expect(await audio.evaluate((v: HTMLAudioElement) => v.duration)).toBeGreaterThan(1);
  const audioUrl = await audio.getAttribute("src");
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(new URL(audioUrl!, page.url()).href)).status()).toBe(401); await anonymous.close();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Проверка", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Создать персонажа", exact: true }).click(); await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+$/);
  await page.getByRole("link", { name: "Голос", exact: true }).click();
  await expect(page.getByLabel("Голос персонажа", { exact: true })).toHaveValue("nova");
  await expect(page.getByLabel("Темп речи")).toHaveValue("0.85");
  await page.getByRole("button", { name: "Послушать голос", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Образец готов");
  expect(await page.locator("audio").getAttribute("src")).toBe(audioUrl);
  expect((await pool.query('SELECT COUNT(*)::int AS count FROM "VoicePreview" v JOIN "User" u ON u.id=v."userId" WHERE u.email=$1', [email])).rows[0].count).toBe(1);
  await page.getByLabel("Манера речи").selectOption("Спокойная"); await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.locator(".form-message--success")).toContainText("Изменения сохранены");
  await page.reload(); await page.waitForLoadState("networkidle"); await expect(page.getByLabel("Манера речи")).toHaveValue("Спокойная");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByLabel("Голос персонажа", { exact: true })).toBeVisible();
    await expect(page.getByText("Загрузка персонажей…", { exact: true })).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/voice-settings-${width}.png`, fullPage: true });
  }
  await page.getByLabel("Сервис озвучки").selectOption("qwen");
  await expect(page.getByLabel("Голос персонажа", { exact: true })).toHaveValue("qwen:Serena");
  await page.getByRole("button", { name: "Послушать голос", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Образец готов");
  const qwenAudio = page.locator("audio");
  await expect.poll(async () => qwenAudio.evaluate((v: HTMLAudioElement) => v.readyState)).toBeGreaterThanOrEqual(1);
  expect(await qwenAudio.evaluate((v: HTMLAudioElement) => v.duration)).toBeGreaterThan(1);
  const qwenAudioUrl = await qwenAudio.getAttribute("src");
  expect((await page.request.get(qwenAudioUrl!)).headers()["content-type"]).toBe("audio/wav");
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.locator(".form-message--success")).toContainText("Изменения сохранены");
  await page.reload();
  await expect(page.getByLabel("Сервис озвучки")).toHaveValue("qwen");
  await expect(page.getByLabel("Голос персонажа", { exact: true })).toHaveValue("qwen:Serena");
  await page.getByRole("button", { name: "Послушать голос", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Образец готов");
  expect(await page.locator("audio").getAttribute("src")).toBe(qwenAudioUrl);
  expect((await pool.query('SELECT COUNT(*)::int AS count FROM "VoicePreview" v JOIN "User" u ON u.id=v."userId" WHERE u.email=$1', [email])).rows[0].count).toBe(2);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/qwen-voice-settings-${width}.png`, fullPage: true });
  }
});
