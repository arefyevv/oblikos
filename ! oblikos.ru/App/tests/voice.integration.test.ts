import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { getDatabase } from "../src/db/client";
import { createVoiceService } from "../src/features/voice/operations";
import { ProxySpeechProvider, SpeechError } from "../src/features/voice/provider";
import { voiceDefaults } from "../src/features/voice/validation";
import { GenerationSafetyError } from "../src/features/ai/safety";
import { createCharacterService } from "../src/features/characters/operations";
import { emptyCharacter } from "../src/features/characters/validation";

const db = getDatabase(), original = { ...process.env };
const contexts: { userId: string; workspaceId: string }[] = [];
let calls = 0;
const provider = { async synthesize() { calls++; await new Promise(r => setTimeout(r, 30)); return Buffer.from("ID3voice-fixture"); } };
const service = (i: number) => createVoiceService(async () => contexts[i], provider);
before(async () => {
  process.env.AUTH_SECRET = randomBytes(48).toString("hex");
  process.env.AI_GENERATION_ENABLED = "true"; process.env.VOICE_GENERATION_ENABLED = "true";
  process.env.AI_VOICE_PER_MINUTE = "100"; process.env.AI_VOICE_PER_DAY = "500"; process.env.AI_VOICE_GLOBAL_PER_DAY = "5000";
  for (let i = 0; i < 2; i++) {
    const user = await db.user.create({ data: { name: "Voice test" } });
    const workspace = await db.workspace.create({ data: { name: "Voice test", slug: randomUUID(), members: { create: { userId: user.id } } } });
    contexts.push({ userId: user.id, workspaceId: workspace.id });
  }
});
after(async () => {
  for (const c of contexts) {
    await db.voicePreview.deleteMany({ where: { workspaceId: c.workspaceId } });
    await db.appearance.deleteMany({ where: { character: { workspaceId: c.workspaceId } } });
    await db.personality.deleteMany({ where: { character: { workspaceId: c.workspaceId } } });
    await db.character.deleteMany({ where: { workspaceId: c.workspaceId } });
    await db.workspaceMember.deleteMany({ where: c });
    await db.workspace.delete({ where: { id: c.workspaceId } });
    await db.user.delete({ where: { id: c.userId } });
  }
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original); await db.$disconnect();
});
const request = () => ({ settings: { ...voiceDefaults }, text: "Привет, я цифровой персонаж.", requestId: randomUUID() });

test("voice persists on creation, editing and duplication; rejects foreign edits and invalid voices", async () => {
  const a = createCharacterService(async () => contexts[0]), b = createCharacterService(async () => contexts[1]);
  const settings = { ...voiceDefaults, voiceId: "nova" as const, speed: "0.85" as const };
  const character = await a.create({ ...emptyCharacter, identity: { ...emptyCharacter.identity, name: "Голос", gender: "Женский", ageRange: "25–34", niche: "Блог" }, voice: settings });
  assert.deepEqual(character.voice, settings);
  await a.update(character.id, "voice", { ...settings, style: "Спокойная" });
  assert.deepEqual((await a.duplicate(character.id)).voice, (await a.get(character.id)).voice);
  const qwenSettings = { ...settings, voiceId: "qwen:Serena" as const, instructions: "Speak naturally." };
  await a.update(character.id, "voice", qwenSettings);
  assert.deepEqual((await a.get(character.id)).voice, qwenSettings);
  assert.deepEqual((await a.duplicate(character.id)).voice, qwenSettings);
  const geminiSettings = { ...settings, voiceId: "gemini:Kore" as const };
  await a.update(character.id, "voice", geminiSettings);
  assert.deepEqual((await a.get(character.id)).voice, geminiSettings);
  assert.deepEqual((await a.duplicate(character.id)).voice, geminiSettings);
  const gemini31Settings = { ...geminiSettings, voiceId: "gemini31:Kore" as const, style: "Тёплая" as const };
  await a.update(character.id, "voice", gemini31Settings);
  assert.deepEqual((await a.get(character.id)).voice, gemini31Settings);
  await assert.rejects(b.update(character.id, "voice", settings));
  await assert.rejects(a.update(character.id, "voice", { ...settings, voiceId: "forged" }));
});
test("one receipt calls speech once; private audio and replay cannot cross users/workspaces", async () => {
  const input = request(), before = calls;
  await service(0).preview(input); await service(0).preview(input);
  assert.equal(calls, before + 1);
  assert.equal((await service(0).audio(input.requestId)).toString(), "ID3voice-fixture");
  await assert.rejects(service(1).audio(input.requestId));
  await assert.rejects(service(1).preview(input));
  await assert.rejects(service(0).preview({ ...input, text: "Другой текст" }));
  assert.equal(calls, before + 1);
});
test("parallel submission never performs a second paid call; expired audio unavailable", async () => {
  const input = request(), before = calls;
  await Promise.allSettled([service(0).preview(input), service(0).preview(input)]);
  assert.equal(calls, before + 1);
  await db.voicePreview.update({ where: { id: input.requestId }, data: { expiresAt: new Date(0) } });
  await assert.rejects(service(0).audio(input.requestId));
  await assert.rejects(service(0).preview(input));
  assert.equal(calls, before + 1);
});
test("switch, quota, revoked membership and invalid input stop before provider", async () => {
  const before = calls;
  process.env.VOICE_GENERATION_ENABLED = "false";
  await assert.rejects(service(0).preview(request()), GenerationSafetyError);
  process.env.VOICE_GENERATION_ENABLED = "true";
  await assert.rejects(service(0).preview({ ...request(), text: "a".repeat(601) }));
  process.env.AI_VOICE_PER_MINUTE = "1";
  await assert.rejects(service(0).preview(request()), GenerationSafetyError);
  await db.workspaceMember.deleteMany({ where: contexts[1] });
  await assert.rejects(service(1).preview(request()), SpeechError);
  assert.equal(calls, before);
});
test("provider sends fixed model, selected voice, speed and style, checks MP3 and never retries", async () => {
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "unit-test-key";
  let attempts = 0;
  try {
    globalThis.fetch = async (url, init) => {
      attempts++;
      assert.equal(url, "https://api.proxyapi.ru/v1/audio/speech");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "openai/gpt-4o-mini-tts"); assert.equal(body.voice, "coral"); assert.equal(body.speed, 1); assert.match(body.instructions, /Естественная/);
      return new Response("ID3unit-fixture", { headers: { "Content-Type": "audio/mpeg" } });
    };
    assert.equal((await new ProxySpeechProvider().synthesize(voiceDefaults, "Привет")).toString(), "ID3unit-fixture");
    globalThis.fetch = async () => { attempts++; return new Response("failure", { status: 503 }); };
    await assert.rejects(new ProxySpeechProvider().synthesize(voiceDefaults, "Привет"), SpeechError);
    assert.equal(attempts, 2);
    globalThis.fetch = async () => new Response("not audio", { headers: { "Content-Type": "audio/mpeg" } });
    await assert.rejects(new ProxySpeechProvider().synthesize(voiceDefaults, "Привет"), SpeechError);
  } finally { globalThis.fetch = originalFetch; }
});
