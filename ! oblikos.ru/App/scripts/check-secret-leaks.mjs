import "dotenv/config";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
const secrets = ["AUTH_SECRET", "OPENAI_API_KEY", "AITUNNEL_API_KEY", "FAL_KEY", "YANDEX_CLIENT_SECRET", "POSTGRES_PASSWORD", "DATABASE_URL"].map((key) => process.env[key]).filter((value) => value && value.length >= 12);
const leaks = [];
let files = 0;
async function scan(target) {
  const info = await stat(target).catch(() => null);
  if (!info) return;
  if (info.isDirectory()) {
    for (const file of await readdir(target)) await scan(path.join(target, file));
  } else if (/\.(?:js|mjs|ts|tsx|json|md|txt|log|yaml|yml|env|example|conf|service|sh|css|svg)$/.test(target)) {
    files++;
    const text = await readFile(target, "utf8");
    if (secrets.some((value) => text.includes(value))) leaks.push(target);
  }
}
for (const root of ["src", "tests", "scripts", "docs", "deploy", "public", "artifacts", ".next/static", "README.md", ".env.example"]) await scan(root);
if (leaks.length) { console.error("Secret leak detected in files:", leaks.join(", ")); process.exitCode = 1; }
else console.log(`Secret leak scan: ${files} source/docs/artifact/client files checked, no configured secrets found.`);
