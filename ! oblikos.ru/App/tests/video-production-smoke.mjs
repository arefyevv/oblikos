// Isolated production-build verification. Only the server process receives the
// offline fetch hook; the deployed application contains no fake-provider switch.
import "dotenv/config";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
const port = process.env.VIDEO_TEST_PORT || "3002", origin = `http://localhost:${port}`;
const root = process.env.PRODUCTION_TEST_MEDIA_ROOT;
const relative = root ? path.relative(process.cwd(), root) : "";
if (!root || !path.isAbsolute(root) || !(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) throw new Error("Set PRODUCTION_TEST_MEDIA_ROOT outside checkout");
await mkdir(root, { recursive: true });
const storage = await mkdtemp(path.join(root, "video-regression-"));
const serverEnv = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=./tests/ai-fetch-hook.mjs`, NEXTAUTH_URL: origin, AUTH_SECRET: randomBytes(48).toString("base64url"), AUTH_LOCAL_HTTP: "true", EMAIL_PROVIDER: "disabled", MEDIA_STORAGE_DIR: storage };
delete serverEnv.NEXT_E2E;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], { env: serverEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", () => {}); server.stderr.on("data", () => {});
async function run(args, env) {
  const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: "inherit" });
  const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  if (code !== 0) throw new Error(`Production verification exited ${code}`);
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("Production server stopped before readiness");
    try { const response = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Production server did not become ready");
  const env = { ...process.env, TEST_EXTERNAL_SERVER: "true", TEST_BASE_URL: origin, TEST_MEDIA_STORAGE_DIR: storage };
  await run(["tests/production-smoke.mjs"], env);
  await run(["node_modules/@playwright/test/cli.js", "test", "tests/e2e/video.spec.ts"], env);
  console.log("Production Auth and Video recovery/streaming E2E passed. No live generation requested.");
} finally {
  server.kill();
  const own = path.relative(root, storage);
  if (own && !own.startsWith("..") && !path.isAbsolute(own)) await rm(storage, { recursive: true, force: true });
}
