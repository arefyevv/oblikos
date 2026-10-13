import "dotenv/config";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { productionJourney } from "../tests/production-journey.mjs";

// Temporary database is generated here, never accepted from user-supplied IDs.
const database = `oblikos_stage7_${randomUUID().replaceAll("-", "")}`;
const root = process.env.PRODUCTION_TEST_MEDIA_ROOT;
const relativeRoot = root ? path.relative(process.cwd(), root) : "";
if (!root || !path.isAbsolute(root) || !(relativeRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeRoot))) {
  throw new Error("Set PRODUCTION_TEST_MEDIA_ROOT to writable persistent directory outside checkout");
}
await mkdir(root, { recursive: true });
const storage = await mkdtemp(path.join(root, "stage7-"));
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${database}`;
const port = process.env.PRODUCTION_TEST_PORT || "3002";
const origin = `http://localhost:${port}`;
const env = { ...process.env, DATABASE_URL: url.href, NODE_ENV: "production", NEXTAUTH_URL: origin, AUTH_SECRET: randomBytes(48).toString("hex"), AUTH_LOCAL_HTTP: "true", EMAIL_PROVIDER: "disabled", MEDIA_STORAGE_DIR: storage, AI_GENERATION_ENABLED: "true", IMAGE_GENERATION_ENABLED: "true" };
delete env.NEXT_E2E;
let server;
let pool;
let created = false;
async function run(args, childEnv = env) {
  const child = spawn(process.execPath, args, { env: childEnv, windowsHide: true, stdio: "inherit" });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  if (code !== 0) throw new Error(`Verification command failed (exit ${code})`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await stopped;
}
async function start() {
  // The explicit offline preload is only in this test process. App has no fake switch.
  const childEnv = { ...env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=./tests/ai-fetch-hook.mjs` };
  // Exact Next command used by npm run start, direct process permits safe stop.
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], { env: childEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  // Runtime diagnostic objects may contain secrets; don't persist raw framework logs.
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});
  server.on("error", () => {});
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Production startup failed (check critical env/storage)");
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Production health never became ready");
}
async function rejectsStartup(overrides) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], {
    env: { ...env, ...overrides }, windowsHide: true, stdio: "ignore",
  });
  const timer = setTimeout(() => child.kill(), 15000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  clearTimeout(timer);
  if (code === 0 || code === null) throw new Error("Invalid critical production config did not fail startup");
}
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  await run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  await run(["node_modules/prisma/build/index.js", "migrate", "status"]);
  await run(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"]);
  await run(["scripts/check-database.mjs"]);
  await rejectsStartup({ AUTH_SECRET: "" });
  await rejectsStartup({ MEDIA_STORAGE_DIR: path.join(process.cwd(), "data", "media") });
  pool = new pg.Pool({ connectionString: url.href, max: 2 });
  await start();
  await productionJourney({ origin, pool, storage,
    restart: async () => { await stop(); await start(); },
    rebuild: async () => { await stop(); await run([process.env.npm_execpath, "run", "build"]); await start(); },
    disableAI: async () => { await stop(); env.AI_GENERATION_ENABLED = "false"; await start(); },
  });
  console.log("Fresh database deploy/status/drift/db check + actual npm start production acceptance passed. Paid calls: 0.");
} finally {
  await stop();
  if (pool) await pool.end();
  if (created) {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
    await admin.query(`DROP DATABASE "${database}"`);
  }
  await admin.end();
  const relative = path.relative(root, storage);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) await rm(storage, { recursive: true, force: true });
}
