import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Exercise the actual split architecture: Vite landing -> Next.js public blog.
export default defineConfig({
  ...base,
  testMatch: "blog.spec.ts",
  webServer: [
    ...(base.webServer ? (Array.isArray(base.webServer) ? base.webServer : [base.webServer]) : []),
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5175",
      cwd: "../Site", url: "http://127.0.0.1:5175", reuseExistingServer: false,
      env: { BLOG_DEV_TARGET: `http://127.0.0.1:${process.env.TEST_PORT || "3001"}` },
    },
  ],
});
