import "dotenv/config";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const emails: string[] = [];
const password = `Character-browser-${randomUUID()}`;
async function register(page: Page) {
  const email = `character-e2e-${randomUUID()}@example.com`;
  emails.push(email);
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByLabel("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}
async function noOverflow(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function fixture(email: string, name: string) {
  const membership = await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=$1', [email]);
  const id = randomUUID();
  await pool.query('INSERT INTO "Character" (id,"workspaceId",name,slug,status,"updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',NOW())', [id, membership.rows[0].workspaceId, name, id]);
  return { id, workspaceId: membership.rows[0].workspaceId };
}
test.afterAll(async () => {
  try {
    const workspaces = await pool.query('SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=ANY($1::text[])', [emails]);
    const ids = workspaces.rows.map((row) => row.workspaceId);
    for (const table of ["MemoryEntry", "Appearance", "Personality"]) await pool.query(`DELETE FROM "${table}" WHERE "characterId" IN (SELECT id FROM "Character" WHERE "workspaceId"=ANY($1::uuid[]))`, [ids]);
    await pool.query('DELETE FROM "Character" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "WorkspaceMember" WHERE "workspaceId"=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM "User" WHERE email=ANY($1::text[])', [emails]);
    await pool.query('DELETE FROM "Workspace" WHERE id=ANY($1::uuid[])', [ids]);
    const directory = join(process.cwd(), "artifacts", "dev-mail");
    for (const file of await readdir(directory)) {
      const path = join(directory, file);
      const message = JSON.parse(await readFile(path, "utf8"));
      if (emails.includes(message.to)) await unlink(path);
    }
  } finally { await pool.end(); }
});

test("memory CRUD persists after reload; sorting, filtering, dialogs and responsive stable tabs", async ({ page }) => {
  test.setTimeout(120000);
  const email = await register(page);
  const character = await fixture(email, "Персонаж с памятью");
  const path = `/characters/${character.id}/memory`;
  const dialog = page.getByRole("dialog");
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Память пока пуста" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Добавить воспоминание" })).toHaveCount(1);
  await expect(page.locator(".memory-heading .button")).toHaveCount(0);
  await page.getByRole("button", { name: "Добавить воспоминание" }).first().click();
  await expect(dialog.getByLabel("Тип", { exact: false })).toBeFocused();
  await dialog.getByRole("button", { name: "Сохранить воспоминание" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Проверьте");
  await expect(dialog.getByLabel("Содержание", { exact: false })).toBeFocused();
  await dialog.getByLabel("Тип", { exact: false }).selectOption("PREFERENCE");
  await dialog.getByLabel("Содержание", { exact: false }).fill("Любит кофе без сахара");
  await dialog.getByRole("button", { name: "Сохранить воспоминание" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Воспоминание добавлено.");
  await expect(page.locator(".memory-count")).toHaveText("1");
  const successList = await page.locator(".memory-list").boundingBox();
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 6000 });
  expect(await page.locator(".memory-list").boundingBox()).toEqual(successList);
  await page.reload();
  await expect(page.locator(".memory-content")).toHaveText("Любит кофе без сахара");
  await page.getByLabel("Действия воспоминания 1").click();
  await page.getByRole("button", { name: "Редактировать", exact: true }).click();
  await expect(dialog.getByLabel("Содержание", { exact: false })).toHaveValue("Любит кофе без сахара");
  await expect(dialog.getByRole("heading")).toHaveText("Редактировать воспоминание");
  await expect(dialog.getByLabel("Тип", { exact: false })).toHaveValue("PREFERENCE");
  await expect(dialog.getByLabel("Важность")).toHaveValue("3");
  await expect(dialog.getByLabel("Закрепить", { exact: true })).not.toBeChecked();
  await dialog.getByLabel("Содержание", { exact: false }).fill("Любит кофе без сахара по утрам");
  await dialog.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".memory-content")).toHaveText("Любит кофе без сахара по утрам");
  await page.getByLabel("Действия воспоминания 1").click();
  await page.getByRole("button", { name: "Закрепить", exact: true }).click();
  await expect(page.locator(".memory-pinned")).toHaveText("Закреплено");
  await page.getByRole("button", { name: "Добавить воспоминание" }).click();
  await dialog.getByLabel("Тип", { exact: false }).selectOption("GOAL");
  await dialog.getByLabel("Содержание", { exact: false }).fill("Запустить собственный бренд");
  await dialog.getByLabel("Важность").selectOption("5");
  await dialog.getByRole("button", { name: "Сохранить воспоминание" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".memory-content")).toHaveText(["Любит кофе без сахара по утрам", "Запустить собственный бренд"]);
  await page.reload();
  await expect(page.locator(".memory-content")).toHaveText(["Любит кофе без сахара по утрам", "Запустить собственный бренд"]);
  await expect(page.locator(".memory-count")).toHaveText("2");
  await page.getByLabel("Тип памяти", { exact: true }).selectOption("GOAL");
  await expect(page.locator(".memory-content")).toHaveText(["Запустить собственный бренд"]);
  await page.getByLabel("Тип памяти", { exact: true }).selectOption("RULE");
  await expect(page.getByRole("heading", { name: "Нет воспоминаний этого типа" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Добавить воспоминание" })).toHaveCount(1);
  await expect(page.locator(".memory-count")).toHaveText("2");
  await page.getByLabel("Тип памяти", { exact: true }).selectOption("all");
  await expect(page.locator(".memory-entry")).toHaveCount(2);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/characters/${character.id}`);
    await noOverflow(page);
    const before = await page.locator(".character-navigation").boundingBox();
    await page.getByRole("link", { name: "Память", exact: true }).click();
    await expect(page.locator(".memory-entry")).toHaveCount(2);
    await noOverflow(page);
    const after = await page.locator(".character-navigation").boundingBox();
    expect(after?.y).toBe(before?.y); expect(after?.x).toBe(before?.x);
    await page.screenshot({ path: `artifacts/memory-list-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Добавить воспоминание" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Тип", { exact: false })).toBeFocused();
    const bounds = await dialog.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(16);
    expect((bounds?.x || 0) + (bounds?.width || 0)).toBeLessThanOrEqual(width - 16);
    await page.screenshot({ path: `artifacts/memory-form-${width}.png`, fullPage: false });
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Сохранить воспоминание" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Добавить воспоминание" })).toBeFocused();
  }
  await page.getByLabel("Действия воспоминания 1").click();
  await page.getByRole("button", { name: "Открепить", exact: true }).click();
  await expect(page.locator(".memory-pinned")).toHaveCount(0);
  await expect(page.locator(".memory-content").first()).toHaveText("Запустить собственный бренд");
  await page.getByLabel("Действия воспоминания 1").click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Отмена", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.locator(".memory-entry")).toHaveCount(2);
  await page.getByLabel("Действия воспоминания 1").click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await dialog.getByRole("button", { name: "Удалить воспоминание" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".memory-content")).toHaveText("Любит кофе без сахара по утрам");
  await expect(page.locator(".memory-count")).toHaveText("1");
  expect((await pool.query('SELECT count(*)::int AS count FROM "MemoryEntry" WHERE "characterId"=$1', [character.id])).rows[0].count).toBe(1);
  await page.goto(`/characters/${character.id}/settings`);
  await page.getByRole("button", { name: "Дублировать персонажа", exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await page.getByRole("link", { name: "Память", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Память пока пуста" })).toBeVisible();
  await expect(page.locator(".memory-count")).toHaveText("0");
});

test("memory polishing keeps one CTA, filtered mutations, transient feedback and stable geometry", async ({ page }) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(10000);
  const email = await register(page);
  const character = await fixture(email, "Проверка памяти");
  const path = `/characters/${character.id}/memory`;
  const dialog = page.getByRole("dialog");
  const filter = page.getByLabel("Тип памяти", { exact: true });
  const add = page.getByRole("button", { name: "Добавить воспоминание", exact: true });
  async function geometry() {
    return page.evaluate(() => [".character-header", ".character-navigation", ".character-content"].map((selector) => {
      const { x, y, width } = document.querySelector(selector)!.getBoundingClientRect();
      // Document coordinates distinguish layout movement from scrolling to an offscreen CTA.
      return { x: x + window.scrollX, y: y + window.scrollY, width };
    }));
  }
  async function success(text: string) {
    await expect(page.getByRole("status")).toHaveText(text);
    await expect(add).toBeEnabled();
    const notification = await page.getByRole("status").boundingBox();
    const viewport = page.viewportSize()!;
    expect(notification!.x).toBeGreaterThanOrEqual(16);
    expect(notification!.x + notification!.width).toBeLessThanOrEqual(viewport.width - 16);
    expect(notification!.y + notification!.height).toBeLessThanOrEqual(viewport.height - 16);
    await page.screenshot({ path: `artifacts/memory-success-${viewport.width}.png`, fullPage: false });
    const content = page.locator(".memory-list, .memory-view > .empty-state");
    const list = await content.boundingBox();
    await page.clock.fastForward(4100);
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(await content.boundingBox()).toEqual(list);
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${path}?type=PREFERENCE`);
    await page.evaluate(() => document.fonts.ready);
    if (width === 1440) await page.clock.install();
    await noOverflow(page);
    const baseline = await geometry();
    await expect(add).toHaveCount(1);
    await expect(page.locator(".memory-count")).toHaveText("0");
    await page.screenshot({ path: `artifacts/memory-polish-empty-${width}.png`, fullPage: true });
    await add.click();
    await expect(dialog.getByLabel("Тип", { exact: false })).toHaveValue("PREFERENCE");
    await page.mouse.click(8, 8); // Native backdrop keeps the editor open.
    await expect(dialog).toBeVisible();
    expect(await geometry()).toEqual(baseline);
    await dialog.getByLabel("Содержание", { exact: false }).fill("Длинное воспоминание: " + "ПримерБезПробелов".repeat(80));
    await dialog.getByLabel("Закрепить", { exact: true }).check();
    await dialog.getByRole("button", { name: "Сохранить воспоминание" }).click();
    await expect(dialog).not.toBeVisible();
    await success("Воспоминание добавлено.");
    await expect(filter).toHaveValue("PREFERENCE");
    await expect(page.locator(".memory-count")).toHaveText("1");
    await expect(add).toHaveCount(1);
    await noOverflow(page);
    expect(await geometry()).toEqual(baseline);
    const memory = await page.locator(".memory-view").boundingBox();
    expect(memory!.width).toBeLessThanOrEqual(780);
    await page.getByLabel("Действия воспоминания 1").click();
    const menu = page.locator(".memory-menu .character-actions-popover");
    await expect(menu).toBeVisible();
    const menuBounds = await menu.boundingBox();
    expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `artifacts/memory-polish-long-menu-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await add.click();
    await dialog.getByLabel("Тип", { exact: false }).selectOption("RULE");
    await dialog.getByLabel("Содержание", { exact: false }).fill("Не обсуждает политику");
    await dialog.getByRole("button", { name: "Сохранить воспоминание" }).click();
    await expect(dialog).not.toBeVisible();
    await success("Воспоминание добавлено.");
    await expect(filter).toHaveValue("PREFERENCE");
    await expect(page.locator(".memory-entry")).toHaveCount(1);
    await expect(page.locator(".memory-count")).toHaveText("2");
    await page.getByLabel("Действия воспоминания 1").click();
    await page.getByRole("button", { name: "Редактировать", exact: true }).click();
    await expect(dialog.getByLabel("Закрепить", { exact: true })).toBeChecked();
    await dialog.getByLabel("Тип", { exact: false }).selectOption("GOAL");
    await dialog.getByRole("button", { name: "Сохранить изменения" }).click();
    await expect(dialog).not.toBeVisible();
    await success("Воспоминание сохранено.");
    await expect(page.getByRole("heading", { name: "Нет воспоминаний этого типа" })).toBeVisible();
    await expect(add).toHaveCount(1);
    await expect(filter).toHaveValue("PREFERENCE");
    await expect(page.locator(".memory-count")).toHaveText("2");
    await expect(add).toBeFocused(); // Edited row left this filter; focus has a visible fallback.
    await filter.selectOption("GOAL");
    await expect(page.locator(".memory-entry")).toHaveCount(1);
    await page.getByLabel("Действия воспоминания 1").click();
    await page.getByRole("button", { name: "Открепить", exact: true }).click();
    await success("Воспоминание откреплено.");
    await page.getByLabel("Действия воспоминания 1").click();
    await page.getByRole("button", { name: "Закрепить", exact: true }).click();
    await success("Воспоминание закреплено.");
    await page.getByLabel("Действия воспоминания 1").click();
    await page.getByRole("button", { name: "Удалить", exact: true }).click();
    await dialog.getByRole("button", { name: "Удалить воспоминание" }).click();
    await expect(dialog).not.toBeVisible();
    await success("Воспоминание удалено.");
    await expect(filter).toHaveValue("GOAL");
    await expect(page.locator(".memory-count")).toHaveText("1");
    await expect(page.getByRole("heading", { name: "Нет воспоминаний этого типа" })).toBeVisible();
    await filter.selectOption("RULE");
    await expect(page.locator(".memory-entry")).toHaveCount(1);
    await page.getByLabel("Действия воспоминания 1").click();
    await page.getByRole("button", { name: "Удалить", exact: true }).click();
    await dialog.getByRole("button", { name: "Удалить воспоминание" }).click();
    await expect(dialog).not.toBeVisible();
    await success("Воспоминание удалено.");
    await expect(page.locator(".memory-count")).toHaveText("0");
    await expect(page.getByRole("heading", { name: "Память пока пуста" })).toBeVisible();
    await expect(filter).toHaveCount(0);
    await expect(page.locator(".memory-heading .button")).toHaveCount(0);
    await expect(add).toHaveCount(1);
    await expect(add).toBeFocused();
    await noOverflow(page);
    expect(await geometry()).toEqual(baseline);
    console.log(`Memory state stability ${width}px: header/tabs/content origin unchanged; feedback expiry unchanged.`);
  }
});

test("memory server actions reject foreign character/entry IDs, selected workspace tampering and anonymous requests", async ({ page, browser }) => {
  test.setTimeout(120000);
  const emailA = await register(page);
  const victim = await fixture(emailA, "Чужая память");
  const victimEntry = randomUUID();
  await pool.query('INSERT INTO "MemoryEntry" (id,"characterId",type,content,"updatedAt") VALUES ($1,$2,\'FACT\',\'Защищённая память\',NOW())', [victimEntry, victim.id]);
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const attacker = await context.newPage();
  const emailB = await register(attacker);
  const own = await fixture(emailB, "Своя память");
  const ownEntry = randomUUID();
  await pool.query('INSERT INTO "MemoryEntry" (id,"characterId",type,content,"updatedAt") VALUES ($1,$2,\'FACT\',\'Своя запись\',NOW())', [ownEntry, own.id]);
  const path = `/characters/${own.id}/memory`;
  const captured: { url: string; headers: Record<string, string>; body: string }[] = [];
  let tamper: "character" | "entry" = "character";
  await attacker.route("**/*", async (route) => {
    const request = route.request(); const body = request.postData();
    if (request.headers()["next-action"] && body?.includes(own.id)) {
      const modified = tamper === "character" ? body.replaceAll(own.id, victim.id) : body.replaceAll(ownEntry, victimEntry);
      captured.push({ url: request.url(), headers: await request.allHeaders(), body: modified });
      await route.continue({ postData: modified });
    } else await route.continue();
  });
  for (const mode of ["character", "entry"] as const) {
    tamper = mode;
    for (const operation of mode === "character" ? ["create", "update", "pin", "delete"] : ["update", "pin", "delete"]) {
      await attacker.goto(path);
      if (operation === "create") await attacker.getByRole("button", { name: "Добавить воспоминание" }).click();
      else {
        await attacker.getByLabel("Действия воспоминания 1").click();
        await attacker.getByRole("button", { name: operation === "update" ? "Редактировать" : operation === "pin" ? "Закрепить" : "Удалить", exact: true }).click();
      }
      if (operation === "create" || operation === "update") {
        await attacker.getByRole("dialog").getByLabel("Содержание", { exact: false }).fill("Подмена памяти");
        await attacker.getByRole("button", { name: operation === "update" ? "Сохранить изменения" : "Сохранить воспоминание" }).click();
      }
      if (operation === "delete") await attacker.getByRole("button", { name: "Удалить воспоминание", exact: true }).click();
      await expect(attacker.locator('.form-message[role="alert"]:visible')).toContainText("Память недоступна");
    }
  }
  expect(captured).toHaveLength(7);
  const record = (await pool.query('SELECT content,"isPinned" FROM "MemoryEntry" WHERE id=$1', [victimEntry])).rows[0];
  expect(record).toEqual({ content: "Защищённая память", isPinned: false });
  expect((await pool.query('SELECT count(*)::int AS count FROM "MemoryEntry" WHERE "characterId"=$1', [victim.id])).rows[0].count).toBe(1);
  await attacker.unroute("**/*");
  await attacker.goto(`/characters/${victim.id}/memory`);
  await expect(attacker.getByRole("heading", { name: "Персонаж недоступен" })).toBeVisible();
  // Membership in both workspaces must still obey the currently selected one.
  await pool.query('INSERT INTO "WorkspaceMember" (id,"workspaceId","userId") SELECT $1,$2,id FROM "User" WHERE email=$3', [randomUUID(), victim.workspaceId, emailB]);
  await context.addCookies([{ name: "oblikos.workspace", value: own.workspaceId, url: new URL(attacker.url()).origin }]);
  await attacker.goto(`/characters/${victim.id}/memory`);
  await expect(attacker.getByRole("heading", { name: "Персонаж недоступен" })).toBeVisible();
  await context.addCookies([{ name: "oblikos.workspace", value: victim.workspaceId, url: new URL(attacker.url()).origin }]);
  await attacker.goto(`/characters/${victim.id}/memory`);
  await expect(attacker.locator(".memory-content")).toHaveText("Защищённая память");
  const anonymous = await browser.newContext({ baseURL: new URL(page.url()).origin });
  for (const request of captured) {
    const headers = { ...request.headers }; delete headers.cookie; delete headers["content-length"];
    const response = await anonymous.request.post(request.url, { headers, data: request.body, maxRedirects: 0 });
    expect(response.headers()["x-action-redirect"] || response.headers().location).toContain("/login");
  }
  await anonymous.close(); await context.close();
});

test("memory network failures keep entries and form input; pending actions prevent repeated submission", async ({ page }) => {
  const email = await register(page);
  const character = await fixture(email, "Проверка ошибок памяти");
  await page.goto(`/characters/${character.id}/memory`);
  await page.getByRole("button", { name: "Добавить воспоминание" }).first().click();
  await page.getByLabel("Содержание", { exact: false }).fill("Сохранить после сбоя");
  let release: (() => void) | undefined;
  let calls = 0;
  await page.route("**/*", async (route) => {
    if (route.request().headers()["next-action"]) {
      calls++;
      await route.fetch(); // Commit once, then drop the response to exercise idempotency.
      await new Promise<void>((resolve) => { release = resolve; });
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Сохранить воспоминание" }).click();
  await expect(page.getByRole("button", { name: "Сохранение…" })).toBeDisabled();
  await expect(page.getByLabel("Содержание", { exact: false })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => Boolean(release)).toBe(true);
  expect(calls).toBe(1); release!();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Не удалось связаться с сервером");
  await expect(page.getByLabel("Содержание", { exact: false })).toHaveValue("Сохранить после сбоя");
  await page.unroute("**/*");
  await page.getByRole("button", { name: "Сохранить воспоминание" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".memory-entry")).toHaveCount(1);
  expect((await pool.query('SELECT count(*)::int AS count FROM "MemoryEntry" WHERE "characterId"=$1', [character.id])).rows[0].count).toBe(1);
  for (const operation of ["update", "pin", "delete"]) {
    release = undefined;
    await page.route("**/*", async (route) => {
      if (route.request().headers()["next-action"]) {
        await new Promise<void>((resolve) => { release = resolve; }); await route.abort("failed");
      } else await route.continue();
    });
    await page.getByLabel("Действия воспоминания 1").click();
    await page.getByRole("button", { name: operation === "update" ? "Редактировать" : operation === "pin" ? "Закрепить" : "Удалить", exact: true }).click();
    if (operation === "update") await page.getByLabel("Содержание", { exact: false }).fill("Правка после сбоя");
    if (operation !== "pin") await page.getByRole("button", { name: operation === "update" ? "Сохранить изменения" : "Удалить воспоминание" }).click();
    await expect.poll(() => Boolean(release)).toBe(true);
    release!();
    await expect(page.locator('.form-message[role="alert"]:visible')).toContainText("Не удалось связаться с сервером");
    await expect(page.locator(".memory-content")).toHaveText("Сохранить после сбоя");
    if (operation === "update") await expect(page.getByLabel("Содержание", { exact: false })).toHaveValue("Правка после сбоя");
    if (operation !== "pin") await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.unroute("**/*");
  }
});

test("character menus dismiss outside, on another menu, on keyboard exit and before confirmation", async ({ page }) => {
  const email = await register(page);
  await fixture(email, "Первый персонаж");
  await fixture(email, "Второй персонаж");
  await page.goto("/characters");
  const first = page.getByLabel("Действия: Первый персонаж", { exact: true });
  const second = page.getByLabel("Действия: Второй персонаж", { exact: true });
  const firstMenu = page.locator("details").filter({ has: first });
  const secondMenu = page.locator("details").filter({ has: second });
  const opened = page.locator(".character-actions details[open]");
  await first.click();
  await expect(firstMenu).toHaveAttribute("open", "");
  const card = page.locator(".character-card").filter({ has: first });
  await card.hover({ position: { x: 10, y: 100 } });
  await page.waitForTimeout(600);
  await expect(firstMenu).toHaveAttribute("open", "");
  await page.getByRole("heading", { name: "Персонажи", exact: true }).hover();
  await page.waitForTimeout(200);
  await expect(firstMenu).toHaveAttribute("open", "");
  await first.hover();
  await page.waitForTimeout(600);
  await expect(firstMenu).toHaveAttribute("open", "");
  await page.getByRole("heading", { name: "Персонажи", exact: true }).hover();
  await expect(firstMenu).not.toHaveAttribute("open");
  await first.click();
  await second.click();
  await expect(firstMenu).not.toHaveAttribute("open");
  await expect(secondMenu).toHaveAttribute("open", "");
  await expect(opened).toHaveCount(1);
  await page.getByRole("heading", { name: "Персонажи", exact: true }).click();
  await expect(opened).toHaveCount(0);
  await first.click();
  await page.keyboard.press("Escape");
  await expect(opened).toHaveCount(0);
  await expect(first).toBeFocused();
  await first.click();
  await firstMenu.getByRole("button", { name: "Удалить", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(opened).toHaveCount(0);
  await first.click();
  await firstMenu.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(opened).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(first).toBeFocused();
  await expect(opened).toHaveCount(0);
});

test("character tabs keep header, labels and content origin stable across viewport sizes", async ({ page }) => {
  test.setTimeout(150000);
  const email = await register(page);
  const character = await fixture(email, "Проверка геометрии");
  const sections = ["", "identity", "appearance", "personality", "memory", "content", "settings", "personality", "settings", "personality", "settings"];
  async function geometry() {
    return page.evaluate(() => {
      const nav = document.querySelector(".character-navigation")!;
      const content = document.querySelector(".character-content") || nav.nextElementSibling!;
      const elements = [
        document.querySelector(".character-header")!,
        ...document.querySelectorAll(".character-header > *, .character-header-copy > *, .character-header-actions > *"),
        nav, ...nav.querySelectorAll("a"),
      ];
      const bounds = elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      });
      const { x, y, width } = content.getBoundingClientRect();
      return { bounds, content: { x, y, width }, scrollY: window.scrollY };
    });
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1200 });
    await page.goto(`/characters/${character.id}/settings`);
    await expect(page.locator('.character-navigation [aria-disabled="true"]')).toHaveText("История · скоро");
    await expect(page.locator('.character-navigation a[href$="/history"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const baseline = await geometry();
    // Sample every frame as well as settled routes, including loading transitions.
    const probe = await page.evaluateHandle(() => {
      const elements = [...document.querySelectorAll(".character-header, .character-header > *, .character-header-copy > *, .character-header-actions > *, .character-navigation, .character-tab, .character-content")];
      const original = elements.map((element) => element.getBoundingClientRect());
      let movement = 0;
      let frame = 0;
      function sample() {
        elements.forEach((element, index) => {
          const current = element.getBoundingClientRect();
          const axes = element.classList.contains("character-content") ? ["x", "y", "width"] as const : ["x", "y", "width", "height"] as const;
          for (const axis of axes) movement = Math.max(movement, Math.abs(current[axis] - original[index][axis]));
        });
        frame = requestAnimationFrame(sample);
      }
      frame = requestAnimationFrame(sample);
      return { finish() { cancelAnimationFrame(frame); return movement; } };
    });
    const overflowStates = new Set<boolean>();
    const screenshots = new Set<string>();
    for (const section of sections) {
      const href = `/characters/${character.id}${section ? `/${section}` : ""}`;
      await page.locator(`.character-navigation a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.locator(".character-loading")).toHaveCount(0);
      await expect(page.locator(`.character-navigation a[href="${href}"]`)).toHaveAttribute("aria-current", "page");
      const current = await geometry();
      for (let index = 0; index < baseline.bounds.length; index++) {
        for (const axis of ["x", "y", "width", "height"] as const) {
          expect(Math.abs(current.bounds[index][axis] - baseline.bounds[index][axis]), `${width}px ${section || "overview"}: element ${index} ${axis}`).toBeLessThanOrEqual(0.1);
        }
      }
      expect(current.content).toEqual(baseline.content);
      expect(current.scrollY).toBe(baseline.scrollY);
      overflowStates.add(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight));
      if (["personality", "settings"].includes(section) && !screenshots.has(section)) {
        await page.screenshot({ path: `artifacts/character-layout-stable-${width}-${section}.png`, fullPage: true });
        screenshots.add(section);
      }
    }
    const movement = await probe.evaluate((value) => value.finish());
    await probe.dispose();
    expect(movement, `${width}px: movement during transition frames`).toBeLessThanOrEqual(0.1);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter)).toBe("stable");
    expect([...overflowStates].sort(), `${width}px must exercise short and scrolling panels`).toEqual([false, true]);
    console.log(`Layout stability ${width}px: max movement ${movement}px; with and without vertical overflow verified.`);
  }
});

test("Character Core: wizard, validation, persistence, editors, duplicate, archive, restore, delete and responsive UI", async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(page);
  await page.goto("/characters");
  await expect(page.getByRole("heading", { name: "У вас пока нет персонажей" })).toBeVisible();
  await page.getByRole("link", { name: "Создать персонажа", exact: true }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await expect(page.getByLabel("Пол", { exact: false })).toHaveValue("");
  await expect(page.getByLabel("Возраст")).toHaveValue("");
  await expect(page.getByLabel("Возраст").locator("option:checked")).toHaveText("Выберите возраст");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.locator('.form-message[role="alert"]:visible')).toContainText("Проверьте");
  await expect(page.getByLabel("Имя персонажа")).toBeFocused();
  await page.getByLabel("Имя персонажа").fill("Дарья");
  await page.getByLabel("Пол", { exact: false }).selectOption("Женский");
  await page.getByLabel("Возраст").selectOption("25–34");
  await page.getByLabel("Ниша / тематика").selectOption("__other");
  await page.getByLabel("Своя ниша").fill("Экологичный дизайн");
  await page.getByLabel("Биография").fill("Дизайнер и исследователь устойчивых материалов.");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow(page);
    await page.screenshot({ path: `artifacts/character-wizard-identity-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel("Цвет волос").selectOption("Рыжие");
  await page.getByLabel("Причёска", { exact: true }).selectOption("Кудрявая");
  await page.getByLabel("Стиль одежды", { exact: true }).selectOption("Минимализм");
  await page.getByLabel("Описание внешности").fill("Веснушки, естественный образ.");
  await page.getByLabel("Дополнительные пожелания").fill("Приглушённые оттенки.");
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.getByLabel("Имя персонажа")).toHaveValue("Дарья");
  await expect(page.getByLabel("Своя ниша")).toHaveValue("Экологичный дизайн");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByLabel("Цвет волос")).toHaveValue("Рыжие");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel("Стиль общения").selectOption("Экспертный");
  await page.getByLabel("Тон", { exact: true }).selectOption("Тёплый");
  const traits = page.locator('.character-traits input[type="checkbox"]');
  for (let index = 0; index < 7; index++) await traits.nth(index).check();
  await expect(traits.nth(7)).toBeDisabled();
  await expect(page.getByText("Выбрано 7 из 7.", { exact: false })).toBeVisible();
  await traits.nth(0).uncheck();
  await expect(traits.nth(7)).toBeEnabled();
  for (let index = 1; index < 7; index++) await traits.nth(index).uncheck();
  await page.getByLabel("Любознательный", { exact: true }).check();
  await page.getByLabel("Эмпатичный", { exact: true }).check();
  await page.getByLabel("Описание личности").fill("Внимательная, любит объяснять сложные вещи.");
  await page.getByLabel("Дополнительные инструкции").fill("Приводить понятные примеры.");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow(page);
    await page.screenshot({ path: `artifacts/character-wizard-review-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Изменить: Внешность" }).click();
  await expect(page.getByLabel("Цвет волос")).toHaveValue("Рыжие");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByLabel("Любознательный", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByRole("button", { name: "Создать персонажа", exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Дарья", exact: true })).toBeVisible();
  const dbRecord = await pool.query('SELECT c.id, a."characterId" AS appearance, p."characterId" AS personality FROM "Character" c JOIN "Appearance" a ON a."characterId"=c.id JOIN "Personality" p ON p."characterId"=c.id WHERE c.id=$1', [id]);
  expect(dbRecord.rows[0]).toEqual({ id, appearance: id, personality: id });
  for (const section of ["identity", "appearance", "personality"]) {
    await page.goto(`/characters/${id}/${section}`);
    const save = page.getByRole("button", { name: "Сохранить изменения" });
    await expect(save).toBeDisabled();
    if (section === "identity") await page.getByLabel("Имя персонажа").fill("Дарья обновлённая");
    if (section === "appearance") await page.getByLabel("Цвет волос").selectOption("Светлые");
    if (section === "personality") await page.getByLabel("Уверенный", { exact: true }).check();
    await save.click();
    await expect(page.getByRole("status")).toHaveText("Изменения сохранены.");
    await expect(save).toBeDisabled();
    await page.reload();
    if (section === "identity") await expect(page.getByLabel("Имя персонажа")).toHaveValue("Дарья обновлённая");
    if (section === "appearance") await expect(page.getByLabel("Цвет волос")).toHaveValue("Светлые");
    if (section === "personality") await expect(page.getByLabel("Уверенный", { exact: true })).toBeChecked();
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ["", "/identity", "/appearance", "/personality", "/settings"]) {
      await page.goto(`/characters/${id}${section}`); await noOverflow(page);
      await page.screenshot({ path: `artifacts/character-${section.slice(1) || "overview"}-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Архивировать персонажа", exact: true }).click();
    await expect(page.getByRole("button", { name: "Отмена", exact: true })).toBeFocused();
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(16);
    expect(bounds?.y).toBeGreaterThanOrEqual(16);
    await noOverflow(page);
    await page.screenshot({ path: `artifacts/character-dialog-${width}.png`, fullPage: false });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Архивировать персонажа", exact: true })).toBeFocused();
  }
  await page.goto(`/characters/${id}/content`);
  await expect(page.getByRole("heading", { name: "Контента пока нет" })).toBeVisible();
  await page.goto(`/characters/${id}/history`);
  await expect(page.getByRole("heading", { name: /пока недоступ/ })).toBeVisible();
  await page.goto(`/characters/${id}/settings`);
  await page.getByRole("button", { name: "Дублировать персонажа", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`${id}/settings$`));
  const copyId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(page.getByRole("heading", { name: "Дарья обновлённая — копия", exact: true })).toBeVisible();
  expect(copyId).not.toBe(id);
  await page.goto(`/characters/${id}/settings`);
  await page.getByRole("button", { name: "Архивировать персонажа", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Архивировать персонажа", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("архивирован");
  await page.goto("/characters?filter=active");
  await expect(page.getByRole("heading", { name: "Дарья обновлённая", exact: true })).not.toBeVisible();
  await page.goto("/characters?filter=archived");
  await expect(page.getByRole("heading", { name: "Дарья обновлённая", exact: true })).toBeVisible();
  await page.getByLabel("Действия: Дарья обновлённая", { exact: true }).click();
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Дарья обновлённая", exact: true })).not.toBeVisible();
  await page.goto("/characters");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow(page);
    await page.screenshot({ path: `artifacts/character-grid-${width}.png`, fullPage: true });
  }
  await page.goto(`/characters/${id}/settings`);
  await page.getByRole("button", { name: "Удалить персонажа", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Отмена", exact: true }).click();
  expect((await pool.query('SELECT "deletedAt" FROM "Character" WHERE id=$1', [id])).rows[0].deletedAt).toBeNull();
  await page.getByRole("button", { name: "Удалить персонажа", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить персонажа", exact: true }).click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.getByRole("heading", { name: "Дарья обновлённая", exact: true })).not.toBeVisible();
  expect((await pool.query('SELECT "deletedAt" FROM "Character" WHERE id=$1', [id])).rows[0].deletedAt).not.toBeNull();
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: "Персонаж недоступен" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("server action tampering cannot read or mutate another user's Character; workspace cookies and anonymous actions denied", async ({ page, browser }) => {
  test.setTimeout(120000);
  const emailA = await register(page);
  const victim = await fixture(emailA, "Чужой персонаж");
  const contextB = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const attacker = await contextB.newPage();
  const emailB = await register(attacker);
  const own = await fixture(emailB, "Свой персонаж");
  await attacker.goto("/characters/new");
  await attacker.getByLabel("Имя персонажа").fill("Создание для проверки доступа");
  await attacker.getByLabel("Пол", { exact: false }).selectOption("Женский");
  await attacker.getByLabel("Возраст").selectOption("25–34");
  await attacker.getByLabel("Ниша / тематика").selectOption("Бизнес");
  for (let step = 0; step < 4; step++) await attacker.getByRole("button", { name: "Продолжить" }).click();
  const creationRequest = attacker.waitForRequest((request) => Boolean(request.headers()["next-action"] && request.postData()?.includes('"identity"')));
  await attacker.getByRole("button", { name: "Создать персонажа", exact: true }).click();
  const creation = await creationRequest;
  await expect(attacker).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await attacker.goto(`/characters/${victim.id}`);
  await expect(attacker.getByRole("heading", { name: "Персонаж недоступен" })).toBeVisible();
  await attacker.goto("/characters");
  await expect(attacker.getByRole("heading", { name: "Чужой персонаж", exact: true })).not.toBeVisible();
  const requests: { url: string; headers: Record<string, string>; body: string }[] = [];
  await attacker.route("**/*", async (route) => {
    const request = route.request();
    const body = request.postData();
    if (request.headers()["next-action"] && body?.includes(own.id)) {
      const modified = body.replaceAll(own.id, victim.id);
      requests.push({ url: request.url(), headers: await request.allHeaders(), body: modified });
      await route.continue({ postData: modified });
    } else await route.continue();
  });
  for (const section of ["identity", "appearance", "personality"]) {
    await attacker.goto(`/characters/${own.id}/${section}`);
    if (section === "identity") { await attacker.getByLabel("Пол", { exact: false }).selectOption("Женский"); await attacker.getByLabel("Возраст").selectOption("25–34"); await attacker.getByLabel("Ниша / тематика").selectOption("Бизнес"); await attacker.getByLabel("Имя персонажа").fill("Подмена"); }
    if (section === "appearance") await attacker.getByLabel("Описание внешности").fill("Подмена");
    if (section === "personality") await attacker.getByLabel("Описание личности").fill("Подмена");
    await attacker.getByRole("button", { name: "Сохранить изменения" }).click();
    await expect(attacker.locator('.form-message[role="alert"]:visible')).toContainText("Персонаж недоступен");
  }
  for (const action of ["Дублировать персонажа", "Архивировать персонажа", "Удалить персонажа", "Восстановить персонажа"]) {
    if (action === "Восстановить персонажа") await pool.query('UPDATE "Character" SET status=\'ARCHIVED\' WHERE id=$1', [own.id]);
    await attacker.goto(`/characters/${own.id}/settings`);
    await attacker.getByRole("button", { name: action, exact: true }).click();
    if (["Архивировать персонажа", "Удалить персонажа"].includes(action)) await attacker.getByRole("dialog").getByRole("button", { name: action, exact: true }).click();
    await expect(attacker.locator('.form-message[role="alert"]:visible')).toContainText("Персонаж недоступен");
  }
  expect(requests).toHaveLength(7);
  const unchanged = (await pool.query('SELECT name,status,"deletedAt" FROM "Character" WHERE id=$1', [victim.id])).rows[0];
  expect(unchanged).toEqual({ name: "Чужой персонаж", status: "ACTIVE", deletedAt: null });
  expect((await pool.query('SELECT count(*)::int AS count FROM "Character" WHERE "workspaceId"=$1', [victim.workspaceId])).rows[0].count).toBe(1);
  const anonymous: BrowserContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const anonymousPage = await anonymous.newPage();
  for (const path of ["/characters", "/characters/new", `/characters/${victim.id}`, `/characters/${victim.id}/identity`]) {
    await anonymousPage.goto(path); await expect(anonymousPage).toHaveURL(/\/login/);
  }
  const request = requests[0];
  const headers = { ...request.headers };
  delete headers.cookie; delete headers["content-length"];
  const response = await anonymous.request.post(request.url, { headers, data: request.body, maxRedirects: 0 });
  expect(response.headers()["x-action-redirect"] || response.headers().location).toContain("/login");
  const creationHeaders = await creation.allHeaders();
  delete creationHeaders.cookie; delete creationHeaders["content-length"];
  const anonymousCreation = await anonymous.request.post(creation.url(), { headers: creationHeaders, data: creation.postData()!, maxRedirects: 0 });
  expect(anonymousCreation.headers()["x-action-redirect"] || anonymousCreation.headers().location).toContain("/login");
  await contextB.addCookies([{ name: "oblikos.workspace", value: victim.workspaceId, domain: "localhost", path: "/" }]);
  await attacker.goto("/characters");
  await expect(attacker.getByRole("heading", { name: "Чужой персонаж", exact: true })).not.toBeVisible();
  await anonymous.close(); await contextB.close();
});

test("Character editor keeps input during a network error and prevents repeated submission", async ({ page }) => {
  const email = await register(page);
  const character = await fixture(email, "Проверка сохранения");
  await page.goto(`/characters/${character.id}/appearance`);
  await page.getByLabel("Описание внешности").fill("Сохранить после повторной попытки.");
  let release: (() => void) | undefined;
  await page.route("**/*", async (route) => {
    if (route.request().headers()["next-action"]) {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  const saving = page.getByRole("button", { name: "Сохранение…" });
  await expect(saving).toBeDisabled();
  await expect(saving).toHaveAttribute("aria-busy", "true");
  await expect(page.getByLabel("Описание внешности")).toBeDisabled();
  await expect.poll(() => Boolean(release)).toBe(true);
  release!();
  await expect(page.locator('.form-message[role="alert"]:visible')).toContainText("Не удалось связаться с сервером");
  await expect(page.getByLabel("Описание внешности")).toHaveValue("Сохранить после повторной попытки.");
  await page.unroute("**/*");
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByRole("status")).toHaveText("Изменения сохранены.");
});

test("creation retries after a lost success response without creating duplicate records", async ({ page }) => {
  const email = await register(page);
  await page.goto("/characters/new");
  await page.getByLabel("Имя персонажа").fill("  Повторная отправка  ");
  await page.getByLabel("Пол", { exact: false }).selectOption("Мужской");
  await page.getByLabel("Возраст").selectOption("35–44");
  await page.getByLabel("Ниша / тематика").selectOption("Технологии");
  for (let step = 0; step < 4; step++) await page.getByRole("button", { name: "Продолжить" }).click();
  let calls = 0;
  let release: (() => void) | undefined;
  await page.route("**/*", async (route) => {
    if (route.request().headers()["next-action"]) {
      calls++;
      await route.fetch(); // The database commits, but the browser loses the response.
      await new Promise<void>((resolve) => { release = resolve; });
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Создать персонажа", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сохранение…" })).toBeDisabled();
  await expect.poll(() => Boolean(release)).toBe(true);
  expect(calls).toBe(1);
  release!();
  await expect(page.locator('.form-message[role="alert"]:visible')).toContainText("Не удалось связаться с сервером");
  await page.unroute("**/*");
  await page.getByRole("button", { name: "Создать персонажа", exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Повторная отправка", exact: true })).toBeVisible();
  const result = await pool.query('SELECT c.id FROM "Character" c JOIN "WorkspaceMember" m ON m."workspaceId"=c."workspaceId" JOIN "User" u ON u.id=m."userId" WHERE u.email=$1', [email]);
  expect(result.rows).toHaveLength(1);
  expect(new URL(page.url()).pathname).toBe(`/characters/${result.rows[0].id}`);
});


