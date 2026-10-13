import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Called only by fresh-DB production runner. Browser secrets never written to disk.
export async function productionJourney({ origin, pool, storage, restart, rebuild, disableAI }) {
  const bundled = path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium_headless_shell-1228", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync(bundled) ? bundled : undefined) });
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const password = `Mvp-${randomUUID()}`;
  const email = `mvp-${randomUUID()}@example.com`;
  async function register(target, address) {
    await target.goto(`${origin}/register`);
    await target.getByLabel("Email", { exact: true }).fill(address);
    await target.getByLabel("Пароль", { exact: true }).fill(password);
    await target.getByLabel("Повторите пароль").fill(password);
    await target.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
    await expect(target).toHaveURL(/\/dashboard$/);
  }
  async function responsive(urls) {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const url of urls) {
        await page.goto(url);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}: ${url}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  try {
    await responsive(["/login", "/register"]);
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Забыли пароль?" })).toHaveCount(0);
    await register(page, email);
    await expect(page.getByRole("link", { name: "Создать первого персонажа" })).toHaveCount(1);
    await page.getByRole("link", { name: "Создать первого персонажа" }).click();
    await page.getByLabel("Имя персонажа").fill("Дарья MVP");
    await page.getByLabel("Пол", { exact: false }).selectOption("Женский");
    await page.getByLabel("Возраст").selectOption("25–34");
    await page.getByLabel("Ниша / тематика").selectOption("Бизнес");
    await page.getByLabel("Биография").fill("Основатель бренда");
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.getByLabel("Цвет волос").selectOption("Рыжие");
    await page.getByLabel("Описание внешности").fill("Веснушки, естественный образ");
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.getByLabel("Стиль общения").selectOption("Дружелюбный");
    await page.getByLabel("Тон", { exact: true }).selectOption("Тёплый");
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.getByRole("button", { name: "Создать персонажа", exact: true }).click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+$/);
    const characterId = new URL(page.url()).pathname.split("/").at(-1);
    const characterPath = `/characters/${characterId}`;
    await page.goto(`${characterPath}/memory`);
    await page.getByRole("button", { name: "Добавить воспоминание" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Содержание").fill("Любит кофе без сахара");
    await dialog.getByRole("button", { name: "Сохранить воспоминание" }).click();
    await expect(dialog).not.toBeVisible();
    await page.goto(`/content/new?characterId=${characterId}`);
    await page.getByLabel("Задача / тема").fill("Напиши короткий пост о бренде");
    await page.getByRole("button", { name: "Сгенерировать", exact: true }).click();
    await expect(page).toHaveURL(/\/content\/[a-f0-9-]+$/);
    const contentPath = new URL(page.url()).pathname;
    await expect(page.getByLabel("Текст", { exact: true })).toHaveValue(/Любит кофе без сахара/);
    await page.getByLabel("Текст", { exact: true }).fill("Ручная правка MVP");
    await page.getByRole("button", { name: "Сохранить изменения" }).click();
    await expect(page.getByRole("button", { name: "Сохранить изменения" })).toBeDisabled();
    await page.goto(`${characterPath}/appearance`);
    await expect(page.getByRole("button", { name: "Создать видео", exact: true })).toHaveCount(0);
    await page.getByLabel("Пожелания к первому изображению").fill("Светлый фон");
    await page.getByRole("button", { name: "Сгенерировать", exact: true }).click();
    await expect(page.locator(".media-card")).toHaveCount(1);
    await page.locator(".media-thumbnail").click();
    await page.getByRole("button", { name: "Использовать как основной образ" }).click();
    await expect(page.locator(".media-preview")).not.toBeVisible();
    const asset = (await pool.query('SELECT id,"storageKey" FROM "MediaAsset" WHERE "characterId"=$1', [characterId])).rows[0];
    const mediaPath = `/api/media/${asset.id}`;
    const bytes = await readFile(path.join(storage, asset.storageKey));
    const originalImage = await page.request.get(mediaPath);
    assert.ok(originalImage.ok());
    assert.equal(originalImage.headers()["cache-control"], "private, no-store");
    assert.equal((await page.request.get(mediaPath, { headers: { Range: "bytes=0-15" } })).status(), 206);
    assert.equal((await page.request.get(mediaPath, { headers: { Range: "bytes=999999999-" } })).status(), 416);
    await responsive(["/characters", characterPath, `${characterPath}/identity`, `${characterPath}/personality`, `${characterPath}/memory`, `${characterPath}/content`, contentPath, `${characterPath}/appearance`, "/content", "/media", "/settings"]);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    assert.equal((await page.request.get(mediaPath)).status(), 401);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Пароль", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    async function persistence() {
      await page.goto(`${characterPath}/identity`);
      await expect(page.getByLabel("Имя персонажа")).toHaveValue("Дарья MVP");
      await page.goto(`${characterPath}/memory`);
      await expect(page.locator(".memory-content")).toHaveText("Любит кофе без сахара");
      await page.goto(contentPath);
      await expect(page.getByLabel("Текст", { exact: true })).toHaveValue("Ручная правка MVP");
      assert.deepEqual(await (await page.request.get(mediaPath)).body(), bytes);
    }
    await persistence();
    await restart();
    await persistence();
    await rebuild();
    await persistence();
    const anon = await browser.newContext();
    assert.equal((await anon.request.get(`${origin}${mediaPath}`)).status(), 401);
    await anon.close();
    const foreign = await browser.newContext();
    const visitor = await foreign.newPage();
    await register(visitor, `foreign-${randomUUID()}@example.com`);
    assert.equal((await foreign.request.get(`${origin}${mediaPath}`)).status(), 404);
    for (const url of [characterPath, `${characterPath}/memory`, contentPath, `/content/new?characterId=${characterId}`]) {
      const response = await visitor.goto(`${origin}${url}`);
      assert.equal(response.status(), 404);
    }
    // Forging Workspace selection cookie still hits server membership check.
    const member = (await pool.query('SELECT "workspaceId","userId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=$1', [email])).rows[0];
    await foreign.addCookies([{ name: "oblikos.workspace", value: member.workspaceId, url: origin }]);
    assert.equal((await foreign.request.get(`${origin}${mediaPath}`)).status(), 404);
    await foreign.close();
    await disableAI();
    await persistence();
    await page.goto(`/content/new?characterId=${characterId}`);
    await page.getByLabel("Задача / тема").fill("Проверка kill switch");
    await page.getByRole("button", { name: "Сгенерировать", exact: true }).click();
    await expect(page.locator('.content-form [role="alert"]')).toContainText("Генерация временно отключена");
    await pool.query('UPDATE "Character" SET status=\'ARCHIVED\' WHERE id=$1', [characterId]);
    await page.goto(`/content/new?characterId=${characterId}`);
    await expect(page.getByRole("heading", { name: "Персонаж в архиве" })).toBeVisible();
    assert.equal((await page.request.get(mediaPath)).status(), 200);
    await pool.query('DELETE FROM "WorkspaceMember" WHERE "workspaceId"=$1 AND "userId"=$2', [member.workspaceId, member.userId]);
    assert.equal((await page.request.get(mediaPath)).status(), 404);
    await pool.query('INSERT INTO "WorkspaceMember" (id,"workspaceId","userId",role) VALUES ($1,$2,$3,\'OWNER\')', [randomUUID(), member.workspaceId, member.userId]);
    await pool.query('UPDATE "Character" SET "deletedAt"=NOW() WHERE id=$1', [characterId]);
    assert.equal((await page.request.get(mediaPath)).status(), 404);
    console.log("Production MVP: full UI journey, 1440/768/390/320, A/B/direct URLs, Range, kill switch, revoked membership, archived/deleted, logout/login, restart + rebuild persistence passed.");
  } finally { await browser.close(); }
}
