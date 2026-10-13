import "dotenv/config";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});
const runId = randomUUID();
const emails: string[] = [];
const mailFiles: string[] = [];
const password = `Browser-test-${randomUUID()}`;

test("new visitors and missing/corrupt cookies reach login without an expiry error", async ({ page, context }) => {
  for (const route of ["/", "/dashboard", "/characters", "/content", "/media", "/settings"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Сессия истекла. Войдите снова.")).toHaveCount(0);
  }
  await context.addCookies([{ name: "next-auth.session-token", value: "corrupt-cookie", domain: "localhost", path: "/" }]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("expired/revoked sessions show expiry, valid session and logout do not loop", async ({ page, context }) => {
  const email = await register(page, "session-redirect");
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await pool.query('UPDATE "AuthSession" SET "expiresAt"=NOW()-INTERVAL \'1 minute\' WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?error=SessionExpired$/);
  await expect(page.getByText("Сессия истекла. Войдите снова.")).toBeVisible();
  await context.clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await login(page, email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await pool.query('DELETE FROM "AuthSession" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email]);
  await page.goto("/characters");
  await expect(page).toHaveURL(/\/login\?error=SessionExpired$/);
  await login(page, email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

async function register(page: Page, prefix: string, value = password) {
  const email = `${prefix}-${runId}@example.com`;
  emails.push(email);
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(value);
  await page.getByLabel("Повторите пароль").fill(value);
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}
async function login(page: Page, email: string, value = password) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}
async function tokenFromMail(email: string, path: string) {
  const directory = join(process.cwd(), "artifacts", "dev-mail");
  for (const file of (await readdir(directory)).sort().reverse()) {
    const fullPath = join(directory, file);
    const message = JSON.parse(await readFile(fullPath, "utf8"));
    if (message.to !== email) continue;
    if (!mailFiles.includes(fullPath)) mailFiles.push(fullPath);
    const url = new URL(message.url);
    if (url.pathname === path) return url.searchParams.get("token");
  }
  throw new Error("Test mail missing");
}

test.afterAll(async () => {
  // Delete only fixtures created by this test run; preserve all user data.
  const result = await pool.query(
    'SELECT "id" FROM "User" WHERE "email" = ANY($1::text[])',
    [emails],
  );
  const ids = result.rows.map((row) => row.id);
  const members = await pool.query(
    'SELECT "workspaceId" FROM "WorkspaceMember" WHERE "userId" = ANY($1::uuid[])',
    [ids],
  );
  const workspaceIds = members.rows.map((row) => row.workspaceId);
  await pool.query(
    'DELETE FROM "Character" WHERE "workspaceId" = ANY($1::uuid[])',
    [workspaceIds],
  );
  await pool.query(
    'DELETE FROM "WorkspaceMember" WHERE "userId" = ANY($1::uuid[])',
    [ids],
  );
  await pool.query('DELETE FROM "User" WHERE "id" = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM "Workspace" WHERE "id" = ANY($1::uuid[])', [
    workspaceIds,
  ]);
  for (const email of emails) {
    const directory = join(process.cwd(), "artifacts", "dev-mail");
    for (const filename of await readdir(directory).catch(() => [])) {
      const path = join(directory, filename);
      const message = JSON.parse(await readFile(path, "utf8"));
      if (message.to === email && !mailFiles.includes(path))
        mailFiles.push(path);
    }
  }
  for (const file of mailFiles) await unlink(file).catch(() => {});
  await pool.end();
});

test("password boundaries in registration UI and login after registration", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(`invalid-boundary-${runId}@example.com`);
  const input = page.getByLabel("Пароль", { exact: true });
  const confirmation = page.getByLabel("Повторите пароль");
  await input.fill("aaaaaaa");
  await confirmation.fill("aaaaaaa");
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page.locator("#auth-password-feedback")).toHaveText("Пароль должен содержать не менее 8 символов.");
  await input.evaluate((element: HTMLInputElement) => { element.value = "a".repeat(129); });
  await confirmation.fill("a".repeat(128));
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await expect(page.locator("#auth-password-feedback")).toHaveText("Пароль не должен превышать 128 символов.");
  for (const length of [8, 128]) {
    const value = "a".repeat(length);
    const email = await register(page, `boundary-${length}`, value);
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, email, value);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("registration → OWNER → persistent session → logout/replay → login → email verification → password reset", async ({
  page,
  context,
  browser,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const email = await register(page, "flow");
  const rows = await pool.query(
    'SELECT u."id", u."emailVerified", p."passwordHash", m."role", m."workspaceId" FROM "User" u JOIN "PasswordCredential" p ON p."userId"=u."id" JOIN "WorkspaceMember" m ON m."userId"=u."id" WHERE u."email"=$1',
    [email],
  );
  expect(rows.rowCount).toBe(1);
  expect(rows.rows[0].role).toBe("OWNER");
  expect(rows.rows[0].passwordHash).toMatch(/^\$argon2id\$/);
  expect(rows.rows[0].emailVerified).toBeNull();
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  const sessionCookies = (await context.cookies()).filter((cookie) =>
    cookie.name.includes("session-token"),
  );
  expect(sessionCookies.length).toBeGreaterThan(0);
  expect(
    sessionCookies.every(
      (cookie) => cookie.httpOnly && cookie.sameSite === "Lax",
    ),
  ).toBe(true);
  await page.goto("/settings");
  await expect(page.getByText("Владелец", { exact: true })).toBeVisible();
  await expect(page.getByText("Email и пароль", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Подключить", exact: true }),
  ).toHaveCount(2);
  await page.screenshot({
    path: "artifacts/settings-stage-2.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/settings-mobile-stage-2.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const replay = await browser.newContext();
  await replay.addCookies(sessionCookies);
  const replayPage = await replay.newPage();
  await replayPage.goto(`${new URL(page.url()).origin}/dashboard`);
  await expect(replayPage).toHaveURL(/\/login/);
  await replay.close();
  await login(page, email, "incorrect-password");
  await expect(page.locator(".form-message[role=alert]")).toContainText(
    "Не удалось войти",
  );
  await login(page, email);
  await expect(page).toHaveURL(/\/dashboard$/);
  const verify = await tokenFromMail(email, "/verify-email");
  await page.goto(`/verify-email?token=${verify}`);
  await page
    .getByRole("button", { name: "Подтвердить email", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Email подтверждён.");
  await page.goto("/settings");
  await expect(
    page.getByText("Подтверждён", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Отправить ссылку" }).click();
  await expect(page.getByRole("status")).toContainText("Если для этого email");
  const reset = await tokenFromMail(email, "/reset-password");
  const newPassword = `Changed-${password}`;
  await page.goto(`/reset-password?token=${reset}`);
  await page.getByLabel("Пароль", { exact: true }).fill(newPassword);
  await page.getByLabel("Повторите пароль").fill(newPassword);
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Все прежние сессии завершены",
  );
  await login(page, email, newPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("workspace cookie/URL substitution cannot expose foreign Character; CSRF and redirects rejected", async ({
  page,
  context,
  browser,
}) => {
  const victim = await register(page, "victim");
  const result = await pool.query(
    'SELECT m."workspaceId" FROM "WorkspaceMember" m JOIN "User" u ON u."id"=m."userId" WHERE u."email"=$1',
    [victim],
  );
  const workspaceId = result.rows[0].workspaceId;
  const characterId = randomUUID();
  await pool.query(
    'INSERT INTO "Character" ("id","workspaceId","name","slug","updatedAt") VALUES ($1,$2,$3,$4,NOW())',
    [characterId, workspaceId, "Test fixture", characterId],
  );
  await page.goto(`/characters/${characterId}`);
  await expect(
    page.getByRole("heading", { name: "Test fixture" }),
  ).toBeVisible();
  const attackerContext: BrowserContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const attacker = await attackerContext.newPage();
  await register(attacker, "attacker");
  const foreign = await attacker.goto(`/characters/${characterId}`);
  expect(foreign?.status()).toBe(404);
  await attackerContext.addCookies([
    {
      name: "oblikos.workspace",
      value: workspaceId,
      domain: "localhost",
      path: "/",
    },
  ]);
  const forbidden = await attacker.goto("/settings");
  expect(forbidden?.status()).toBe(404);
  await attackerContext.close();
  const csrf = await context.request.post("/api/auth/signout", {
    headers: { origin: "https://evil.example" },
    form: { csrfToken: "fake" },
  });
  expect(csrf.status()).toBe(403);
  const noCsrf = await context.request.post("/api/auth/callback/credentials", {
    headers: { origin: new URL(page.url()).origin },
    form: {
      email: victim,
      password,
      callbackUrl: "https://evil.example",
      json: "true",
    },
  });
  expect(noCsrf.status()).toBeLessThan(500);
  expect(noCsrf.headers().location || "").not.toContain("evil.example");
  const unavailable = await context.request.get("/api/auth/signin/vk", {
    maxRedirects: 0,
  });
  expect(unavailable.headers().location).toContain("ProviderUnavailable");
});

test("login and registration fit desktop and mobile viewports", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["login", "register"]) {
      await page.goto(`/${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/${route}-${width}-stage-2.png`,
        fullPage: true,
      });
    }
  }
});

