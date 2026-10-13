import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const email = `video-activity-${randomUUID()}@example.com`;
let workspaceId: string | undefined;
test.afterAll(async () => {
  try {
    if (workspaceId) {
      await pool.query('DELETE FROM "MediaGeneration" WHERE "workspaceId"=$1', [workspaceId]);
      await pool.query('DELETE FROM "Character" WHERE "workspaceId"=$1', [workspaceId]);
      await pool.query('DELETE FROM "WorkspaceMember" WHERE "workspaceId"=$1', [workspaceId]);
      await pool.query('DELETE FROM "Workspace" WHERE id=$1', [workspaceId]);
    }
    await pool.query('DELETE FROM "User" WHERE email=$1', [email]);
  } finally { await pool.end(); }
});

test("queue stages, persistent navigation, terminal notifications and reload deduplication", async ({ page }) => {
  test.setTimeout(120000);
  expect(["127.0.0.1", "localhost"]).toContain(new URL(process.env.DATABASE_URL!).hostname);
  await page.addInitScript(() => {
    const state = { requests: 0, titles: [] as string[] };
    Object.assign(window, { __videoNotificationTest: state });
    class TestNotification {
      static permission: NotificationPermission = "default";
      static async requestPermission() { state.requests++; this.permission = "granted"; return this.permission; }
      constructor(title: string) { state.titles.push(title); }
      close() {}
    }
    Object.defineProperty(window, "Notification", { value: TestNotification, configurable: true });
  });
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  const password = `Fixture-${randomUUID()}`;
  await page.getByLabel("Пароль", { exact: true }).fill(password); await page.getByLabel("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  workspaceId = (await pool.query('SELECT "workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u.id=m."userId" WHERE u.email=$1', [email])).rows[0].workspaceId;
  const characterId = randomUUID(), id = randomUUID();
  await pool.query('INSERT INTO "Character" (id,"workspaceId",name,slug,status,kind,"updatedAt") VALUES ($1,$2,$3,$4,\'ACTIVE\',\'ANIMAL\',NOW())', [characterId, workspaceId, "Три котёнка, тест статуса", characterId]);
  // No provider ID: polling reads this isolated fixture without any AI call.
  await pool.query('INSERT INTO "MediaGeneration" (id,"workspaceId","characterId",fingerprint,type,mode,status,scene,parameters,"createdAt","updatedAt") VALUES ($1,$2,$3,\'activity-test\',\'VIDEO\',\'PERFORMANCE\',\'PROCESSING\',$4,$5,NOW()-INTERVAL \'8 minutes\',NOW())', [id, workspaceId, characterId, "Тестовое исполнение", JSON.stringify({ providerStatus: "PENDING" })]);
  await page.goto(`/animation?characterId=${characterId}`);
  await expect(page.getByRole("heading", { name: "В очереди", exact: true })).toBeVisible();
  const progress = page.getByRole("progressbar", { name: "Создание видео" });
  await expect(progress).toHaveAttribute("aria-valuetext", "В очереди");
  await expect(progress).not.toHaveAttribute("aria-valuenow");
  await expect(page.getByText("Прошло 8 мин", { exact: true })).toBeVisible();
  const activity = page.getByRole("complementary", { name: "Статус видео" });
  await expect(activity).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(() => Reflect.get(window, "__videoNotificationTest").requests)).toBe(0);
  await activity.getByText("Уведомления", { exact: true }).click();
  await activity.getByRole("button", { name: "Уведомлять в браузере" }).click();
  expect(await page.evaluate(() => Reflect.get(window, "__videoNotificationTest").requests)).toBe(1);
  await expect(activity.getByText("Уведомим о результате, пока сайт открыт.")).toBeVisible();
  await activity.getByText("Уведомления", { exact: true }).click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/video-queue-${width}.png` });
  }
  await pool.query('UPDATE "MediaGeneration" SET parameters=$2 WHERE id=$1', [id, JSON.stringify({ providerStatus: "PROCESSING" })]);
  await expect(page.getByRole("heading", { name: "Видео генерируется", exact: true })).toBeVisible({ timeout: 20000 });
  await pool.query('UPDATE "MediaGeneration" SET parameters=$2 WHERE id=$1', [id, JSON.stringify({ providerStatus: "READY" })]);
  await expect(page.getByRole("heading", { name: "Сохраняем видео", exact: true })).toBeVisible({ timeout: 20000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "Обзор", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(activity).toBeVisible();
  await pool.query('UPDATE "MediaGeneration" SET status=\'READY\' WHERE id=$1', [id]);
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(activity.getByText("Видео готово", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(activity.getByRole("link", { name: "Смотреть видео", exact: true })).toHaveAttribute("href", `/characters/${characterId}/media?type=VIDEO`);
  expect(await page.evaluate(() => Reflect.get(window, "__videoNotificationTest").titles)).toEqual(["Видео готово"]);
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }));
  await page.screenshot({ path: "artifacts/video-ready-notification.png" });
  await page.reload();
  await expect(activity).not.toBeVisible();
  const failedId = randomUUID();
  await pool.query('INSERT INTO "MediaGeneration" (id,"workspaceId","characterId",fingerprint,type,mode,status,scene,"createdAt","updatedAt") VALUES ($1,$2,$3,\'activity-error-test\',\'VIDEO\',\'PERFORMANCE\',\'PENDING\',$4,NOW(),NOW())', [failedId, workspaceId, characterId, "Тест ошибки"]);
  await page.evaluate(id => window.dispatchEvent(new CustomEvent("oblikos:video-enqueued", { detail: { id } })), failedId);
  await expect(activity.getByText("Отправляем задание", { exact: true })).toBeVisible({ timeout: 20000 });
  await pool.query('UPDATE "MediaGeneration" SET status=\'FAILED\',"errorCode"=\'seedance_source_resolution\' WHERE id=$1', [failedId]);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(activity.getByRole("alert")).toContainText("Исходное видео слишком маленькое", { timeout: 20000 });
  await expect(activity.getByRole("link", { name: "Открыть историю" })).toHaveAttribute("href", `/animation?characterId=${characterId}`);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/video-error-notification-320.png" });
  await activity.getByRole("button", { name: "Закрыть уведомление" }).click();
  await expect(activity).not.toBeVisible();
});
