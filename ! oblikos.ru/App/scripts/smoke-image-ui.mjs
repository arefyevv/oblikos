import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright";

// Verification of an existing paid result only. Never triggers generation.
const artifact = process.argv[2];
const diagnostics = JSON.parse(await readFile(artifact, "utf8"));
assert.equal(diagnostics.phase, "saved");
assert.equal(diagnostics.calls, 1);
const origin = "http://localhost:3006";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const sessionId = randomUUID();
let browser;
try {
  const member = (await pool.query('SELECT "userId" FROM "WorkspaceMember" WHERE "workspaceId"=$1 AND role=\'OWNER\'', [diagnostics.workspaceId])).rows[0];
  assert.ok(member);
  await pool.query('INSERT INTO "AuthSession" (id,"userId","expiresAt") VALUES ($1,$2,$3)', [sessionId, member.userId, new Date(Date.now() + 10 * 60 * 1000)]);
  const token = await encode({ secret: process.env.AUTH_SECRET, token: { sub: member.userId, sid: sessionId }, maxAge: 600 });
  browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium_headless_shell-1228", "chrome-headless-shell-win64", "chrome-headless-shell.exe") });
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    { name: "next-auth.session-token", value: token, url: origin, httpOnly: true, sameSite: "Lax" },
    { name: "oblikos.workspace", value: diagnostics.workspaceId, url: origin, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`/characters/${diagnostics.characterId}/appearance`);
  const src = `/api/media/${diagnostics.mediaAssetId}`;
  const image = page.locator(`.media-thumbnail img[src="${src}"]`);
  await image.waitFor({ state: "visible" });
  const loaded = async (locator) => {
    await locator.evaluate((img) => img.decode());
    assert.ok(await locator.evaluate((img) => img.complete && img.naturalWidth > 0));
  };
  await loaded(image);
  await page.reload();
  await loaded(image);
  const response = await page.request.get(src);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()["content-type"], diagnostics.mimeType);
  assert.equal((await response.body()).length, diagnostics.fileSize);
  diagnostics.reloadVerified = true;
  diagnostics.privateRouteStatus = response.status();
  await image.locator("..").click();
  const dialog = page.locator(".media-preview");
  await dialog.waitFor({ state: "visible" });
  await loaded(dialog.locator(".media-full-image img"));
  await dialog.getByRole("button", { name: "Использовать как основной образ", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const headerImage = page.locator(`.media-header-image img[src="${src}"]`);
  await headerImage.waitFor({ state: "visible" });
  await loaded(headerImage);
  diagnostics.headerUpdatedWithoutReload = true;
  await page.reload();
  await loaded(headerImage);
  const primary = (await pool.query('SELECT id FROM "MediaAsset" WHERE "characterId"=$1 AND "isPrimaryReference"=true AND "deletedAt" IS NULL', [diagnostics.characterId])).rows;
  assert.deepEqual(primary.map((row) => row.id), [diagnostics.mediaAssetId]);
  diagnostics.primaryVerified = true;
  diagnostics.headerImageVerified = true;
  await page.screenshot({ path: "artifacts/image-live-smoke-primary.png", fullPage: true });
  let files = 0, hits = 0;
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(file);
      else { files++; if ((await readFile(file)).includes(Buffer.from(process.env.OPENAI_API_KEY.trim()))) hits++; }
    }
  }
  await scan(".next/static");
  assert.equal(hits, 0);
  diagnostics.clientBundleFiles = files;
  diagnostics.apiKeyOccurrences = hits;
  diagnostics.phase = "verified";
  await writeFile(artifact, JSON.stringify(diagnostics, null, 2));
  console.log(JSON.stringify({ reload: true, primary: true, header: true, clientBundleFiles: files, apiKeyOccurrences: hits }));
} catch (error) {
  // Never print tokens, cookies, environment values or arbitrary browser errors.
  diagnostics.uiVerificationFailed = true;
  await writeFile(artifact, JSON.stringify(diagnostics, null, 2));
  console.error(JSON.stringify({ uiVerificationFailed: true, errorType: error?.name || "UnknownError" }));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await pool.query('DELETE FROM "AuthSession" WHERE id=$1', [sessionId]);
  await pool.end();
}
