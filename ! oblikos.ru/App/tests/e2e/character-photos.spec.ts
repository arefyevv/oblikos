import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import sharp from "sharp";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const email = `photo-browser-${randomUUID()}@example.com`;
test.afterAll(async () => {
  const user = (await pool.query('SELECT id FROM "User" WHERE email=$1', [email])).rows[0];
  if (user) {
    const ids = (await pool.query('SELECT "workspaceId" FROM "WorkspaceMember" WHERE "userId"=$1', [user.id])).rows.map((row) => row.workspaceId);
    const assets = (await pool.query('SELECT "storageKey" FROM "MediaAsset" WHERE "workspaceId"=ANY($1::uuid[])', [ids])).rows;
    for (const table of ["MediaGeneration", "MediaAsset"]) await pool.query(`DELETE FROM "${table}" WHERE "workspaceId"=ANY($1::uuid[])`, [ids]);
    for (const table of ["Appearance", "Personality"]) await pool.query(`DELETE FROM "${table}" WHERE "characterId" IN (SELECT id FROM "Character" WHERE "workspaceId"=ANY($1::uuid[]))`, [ids]);
    await pool.query('DELETE FROM "Character" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "WorkspaceMember" WHERE "userId"=$1', [user.id]);
    await pool.query('DELETE FROM "User" WHERE id=$1', [user.id]);
    await pool.query('DELETE FROM "Workspace" WHERE id=ANY($1::uuid[])', [ids]);
    const root = path.resolve(process.cwd(), "artifacts", "media-e2e");
    for (const asset of assets) {
      const target = path.resolve(root, asset.storageKey);
      if (!target.startsWith(root + path.sep)) throw new Error("Unsafe fixture path");
      await unlink(target).catch(() => {});
    }
  }
  const mailRoot = path.join(process.cwd(), "artifacts", "dev-mail");
  for (const file of await readdir(mailRoot).catch(() => [])) {
    const target = path.join(mailRoot, file);
    const mail = JSON.parse(await readFile(target, "utf8"));
    if (mail.to === email) await unlink(target);
  }
  await pool.end();
});

test("create by photo: ten-file limit, primary selection, AI appearance, private persisted gallery and mobile", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  const password = `Photos-${randomUUID()}`;
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByLabel("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/characters/new");
  await expect(page.getByRole("button", { name: "По фото", exact: true })).toHaveCount(0);
  await expect(page.locator(".character-photo-panel")).toHaveCount(0);
  await page.getByLabel("Имя персонажа").fill("Персонаж по фото");
  await page.locator("#identity-gender").selectOption("Женский");
  await page.locator("#identity-ageRange").selectOption("25–34");
  await page.getByLabel("Ниша / тематика").selectOption("Lifestyle");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.locator(".character-photo-panel")).toBeVisible();
  const buffer = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#d3c1aa" } }).png().toBuffer();
  const files = Array.from({ length: 11 }, (_, i) => ({ name: `reference-${i}.png`, mimeType: "image/png", buffer }));
  await page.getByLabel("Загрузить фотографии персонажа").setInputFiles(files);
  await expect(page.locator(".character-photo-panel [role=alert]")).toContainText("не более 10 фото");
  await page.getByLabel("Загрузить фотографии персонажа").setInputFiles(files.slice(0, 10));
  await expect(page.locator(".character-photo-grid li")).toHaveCount(10);
  await page.getByRole("button", { name: "Сделать фото 3 основным", exact: true }).click();
  await page.getByRole("button", { name: "Удалить фото 10", exact: true }).click();
  await expect(page.locator(".character-photo-grid li")).toHaveCount(9);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/character-photos-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Заполнить внешность по фото", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Внешность заполнена", { timeout: 30000 });
  await expect(page.getByLabel("Описание внешности")).toHaveValue(/Учтено фото: 9/);
  await expect(page.locator("#appearance-hairStyle-custom")).toHaveValue("Волнистое каре");
  await page.screenshot({ path: "artifacts/character-photos-appearance.png", fullPage: true });
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.locator(".character-photo-summary")).toContainText("9 фото");
  await page.getByRole("button", { name: "Создать персонажа", exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/, { timeout: 30000 });
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const result = await pool.query('SELECT "isPrimaryReference",provider FROM "MediaAsset" WHERE "characterId"=$1', [id]);
  expect(result.rows.length).toBe(9);
  expect(result.rows.filter((row) => row.isPrimaryReference).length).toBe(1);
  expect(result.rows.every((row) => row.provider === "user-upload")).toBe(true);
  await page.goto(`/characters/${id}/appearance`);
  await expect(page.locator(".character-photo-panel")).toBeVisible();
  await page.getByLabel("Загрузить фотографии персонажа").setInputFiles(files.slice(0, 1));
  await expect(page.locator(".character-photo-grid li")).toHaveCount(1);
  await page.getByLabel("Описание внешности").fill("Обновлённая внешность по дополнительному фото.");
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Внешность и фото сохранены");
  await expect(page.locator(".character-photo-grid li")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Описание внешности")).toHaveValue("Обновлённая внешность по дополнительному фото.");
  await page.goto(`/characters/${id}/media`);
  await expect(page.locator(".media-gallery .media-card")).toHaveCount(10);
  const photo = (await pool.query('SELECT id FROM "MediaAsset" WHERE "characterId"=$1 LIMIT 1', [id])).rows[0];
  expect((await page.request.get(`/api/media/${photo.id}`)).status()).toBe(200);
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get(`/api/media/${photo.id}`, { maxRedirects: 0 })).status()).not.toBe(200);
});
