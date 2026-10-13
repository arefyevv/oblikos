import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import pg from "pg";

const base = process.env.TEST_BASE_URL || "http://localhost:3002";
const bundledBrowser = join(
  process.env.LOCALAPPDATA || "",
  "ms-playwright",
  "chromium_headless_shell-1228",
  "chrome-headless-shell-win64",
  "chrome-headless-shell.exe",
);
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    (existsSync(bundledBrowser) ? bundledBrowser : undefined),
});
const context = await browser.newContext({ baseURL: base });
const page = await context.newPage();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});
const email = `production-smoke-${randomUUID()}@example.com`;
const password = `Smoke-password-${randomUUID()}`;
try {
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByLabel("Повторите пароль").fill(password);
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
  await page.reload();
  assert.equal(new URL(page.url()).pathname, "/dashboard");
  await page.goto("/settings");
  assert.ok(await page.getByText("Владелец", { exact: true }).isVisible());
  assert.ok(
    await page
      .getByRole("button", { name: "Подтвердить email", exact: true })
      .isDisabled(),
  );
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await page.waitForURL("**/login");
  await page.goto("/dashboard");
  assert.equal(new URL(page.url()).pathname, "/login");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL("**/dashboard");
  const result = await pool.query(
    'SELECT "emailVerified" FROM "User" WHERE "email"=$1',
    [email],
  );
  assert.equal(result.rows[0].emailVerified, null);
  console.log(
    "Production smoke: registration, OWNER, refresh, logout, protection, repeat login, email fail-closed — passed.",
  );
} finally {
  const user = await pool.query('SELECT "id" FROM "User" WHERE "email"=$1', [
    email,
  ]);
  if (user.rowCount) {
    const id = user.rows[0].id;
    const memberships = await pool.query(
      'SELECT "workspaceId" FROM "WorkspaceMember" WHERE "userId"=$1',
      [id],
    );
    await pool.query('DELETE FROM "WorkspaceMember" WHERE "userId"=$1', [id]);
    await pool.query('DELETE FROM "User" WHERE "id"=$1', [id]);
    for (const membership of memberships.rows)
      await pool.query('DELETE FROM "Workspace" WHERE "id"=$1', [
        membership.workspaceId,
      ]);
  }
  await pool.end();
  await browser.close();
}
