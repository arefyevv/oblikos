import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const bundledBrowser = join(
  process.env.LOCALAPPDATA || "",
  "ms-playwright",
  "chromium_headless_shell-1228",
  "chrome-headless-shell-win64",
  "chrome-headless-shell.exe",
);
const testPort = process.env.TEST_PORT || "3001";
const testOrigin = `http://localhost:${testPort}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  outputDir: "artifacts/e2e-results",
  reporter: "list",
  use: {
    baseURL: process.env.TEST_BASE_URL || testOrigin,
    trace: "off", // Auth traces can record passwords, cookies and tokens.
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
        (existsSync(bundledBrowser) ? bundledBrowser : undefined),
    },
  },
  webServer:
    process.env.TEST_EXTERNAL_SERVER === "true"
      ? undefined
      : {
          command: `npm run dev -- --port ${testPort}`,
          url: `${testOrigin}/login`,
          reuseExistingServer: false,
          env: { NEXTAUTH_URL: testOrigin, AUTH_SECRET: randomBytes(48).toString("base64url"), NEXT_E2E: "true", MEDIA_STORAGE_DIR: join(process.cwd(), "artifacts", "media-e2e"), NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=./tests/ai-fetch-hook.mjs` },
        },
});
