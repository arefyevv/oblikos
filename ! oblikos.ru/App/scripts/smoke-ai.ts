import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { getDatabase } from "../src/db/client";
import { createContentService } from "../src/features/content/operations";
import { OpenAIProvider } from "../src/features/ai/provider";
import { AIError } from "../src/features/ai/types";

// Explicit opt-in only. Not part of automated test scripts; one provider request.
const characterId = process.argv[2];
const key = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
const baseURL = process.env.OPENAI_BASE_URL;
if (!characterId || !key?.trim() || !model?.trim()) throw new Error("Character ID and AI environment are required.");
const db = getDatabase();
const originalFetch = globalThis.fetch;
const diagnostics: Record<string, unknown> = { model, calls: 0 };
function safe(value: unknown) {
  return typeof value === "string" ? value.split(key!).join("[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500) : undefined;
}
try {
  const character = await db.character.findFirstOrThrow({ where: { id: characterId, deletedAt: null, status: { not: "ARCHIVED" } } });
  const member = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId: character.workspaceId, role: "OWNER" } });
  globalThis.fetch = async (input, init) => {
    diagnostics.calls = Number(diagnostics.calls) + 1;
    if (diagnostics.calls !== 1) throw new Error("Smoke test permits one provider call only.");
    const endpoint = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    assert.equal(new URL(endpoint).origin, new URL(baseURL || "https://api.openai.com/v1").origin);
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model, model);
    assert.deepEqual(payload.input.map((item: { role: string }) => item.role), ["system", "developer", "user"]);
    const context = JSON.parse(payload.input[1].content.split("\n").slice(1).join("\n"));
    assert.equal(context.IDENTITY.name, character.name);
    diagnostics.endpoint = endpoint;
    diagnostics.characterId = character.id;
    diagnostics.identityFields = Object.keys(context.IDENTITY);
    diagnostics.personalityFields = Object.keys(context.PERSONALITY);
    diagnostics.memoryEntries = context.MEMORY.length;
    const response = await originalFetch(input, init);
    diagnostics.httpStatus = response.status;
    if (!response.ok) {
      const error = await response.clone().json().catch(() => null);
      diagnostics.providerError = { code: safe(error?.error?.code), type: safe(error?.error?.type), message: safe(error?.error?.message || error?.message || error?.detail) };
    }
    return response;
  };
  const content = createContentService(async () => ({ userId: member.userId, workspaceId: member.workspaceId }), new OpenAIProvider());
  const result = await content.generate({ characterId, type: "SHORT_POST", instruction: "Напиши короткое знакомство от своего имени, 2–3 предложения. Учитывай свою личность и важные факты памяти. Не добавляй неизвестные факты." }, randomUUID());
  const saved = await content.get(result.id);
  assert.equal(saved.body, result.body);
  assert.equal(saved.model, model);
  assert.ok(saved.body.trim().length > 0);
  diagnostics.contentId = saved.id;
  diagnostics.bodyLength = saved.body.length;
  diagnostics.saved = true;
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/ai-real-smoke.json", JSON.stringify(diagnostics, null, 2), "utf8");
  console.log(JSON.stringify(diagnostics));
} catch (error) {
  diagnostics.failure = error instanceof AIError ? error.code : error instanceof Error ? safe(error.message) : "UnknownError";
  console.error(JSON.stringify(diagnostics));
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  await db.$disconnect();
}
