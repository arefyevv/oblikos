import { test } from "node:test";
import assert from "node:assert/strict";
import { ProxySpeechProvider, SpeechError, pcmToWav, speechContentType, gemini31SpeechText } from "../src/features/voice/provider";
import { voiceDefaults } from "../src/features/voice/validation";
import { voiceGender, voicesByGender } from "../src/features/voice/catalog";

test("Gemini routes with AITUNNEL key and converts PCM without speaking instructions", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.AITUNNEL_API_KEY;
  let calls = 0;
  try {
    process.env.AITUNNEL_API_KEY = "gemini-test-key";
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), "https://api.aitunnel.ru/v1/audio/speech");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer gemini-test-key");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "gemini-3.8-flash-lite-tts", voice: "Kore", input: "Привет", response_format: "pcm",
      });
      return new Response(new Uint8Array([0, 0, 1, 0]), { headers: { "Content-Type": "audio/pcm;rate=24000" } });
    };
    const settings = { ...voiceDefaults, voiceId: "gemini:Kore" as const, instructions: "Do not speak this" };
    const wav = await new ProxySpeechProvider().synthesize(settings, "Привет");
    assert.equal(speechContentType(wav), "audio/wav");
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), 4);
    assert.deepEqual([...wav.subarray(44)], [0, 0, 1, 0]);
    globalThis.fetch = async () => { calls++; return new Response("denied", { status: 401 }); };
    await assert.rejects(new ProxySpeechProvider().synthesize(settings, "Привет"), (e: unknown) => e instanceof SpeechError && e.code === "aitunnelConfiguration");
    assert.equal(calls, 2);
    globalThis.fetch = async () => new Response("invalid", { headers: { "Content-Type": "application/json" } });
    await assert.rejects(new ProxySpeechProvider().synthesize(settings, "Привет"), SpeechError);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AITUNNEL_API_KEY; else process.env.AITUNNEL_API_KEY = originalKey;
  }
});

test("PCM conversion preserves WAV and rejects incomplete samples or unexpected rates", () => {
  const wav = pcmToWav(Buffer.alloc(4), "audio/pcm");
  assert.equal(pcmToWav(wav, "audio/wav"), wav);
  assert.throws(() => pcmToWav(Buffer.alloc(0), "audio/pcm"), SpeechError);
  assert.throws(() => pcmToWav(Buffer.alloc(3), "audio/pcm"), SpeechError);
  assert.throws(() => pcmToWav(Buffer.alloc(4), "audio/pcm;rate=16000"), SpeechError);
});

test("gender catalog covers all presets and age delivery remains independent of the selected voice", () => {
  const female = voicesByGender("female"), male = voicesByGender("male");
  assert.equal(female.length, 14);
  assert.equal(male.length, 16);
  assert.equal(new Set([...female, ...male]).size, 30);
  assert.ok(female.every(id => voiceGender(id) === "female"));
  assert.ok(male.every(id => voiceGender(id) === "male"));
  const settings = { ...voiceDefaults, voiceId: "gemini31:Kore" as const };
  assert.match(gemini31SpeechText({ ...settings, ageTone: "young" }, "Текст"), /youthful adult/);
  assert.match(gemini31SpeechText({ ...settings, ageTone: "older" }, "Текст"), /older, mature adult/);
  assert.doesNotMatch(gemini31SpeechText(settings, "Текст"), /youthful adult|older, mature adult/);
});

test("Gemini 3.1 forwards delivery notes only to the preview model", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.AITUNNEL_API_KEY;
  const settings = { ...voiceDefaults, voiceId: "gemini31:Kore" as const, speed: "0.85" as const, style: "Тёплая" as const, instructions: "Делать паузы." };
  try {
    process.env.AITUNNEL_API_KEY = "test-key";
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gemini-3.1-flash-tts-preview");
      assert.equal(body.voice, "Kore");
      assert.equal(body.input, gemini31SpeechText(settings, "Привет"));
      assert.match(body.input, /warm and friendly/);
      assert.match(body.input, /slow pace/);
      assert.match(body.input, /Делать паузы/);
      assert.ok(body.input.endsWith("TRANSCRIPT\nПривет"));
      assert.equal(body.response_format, "pcm");
      return new Response(new Uint8Array(4), { headers: { "Content-Type": "audio/pcm" } });
    };
    assert.equal(speechContentType(await new ProxySpeechProvider().synthesize(settings, "Привет")), "audio/wav");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AITUNNEL_API_KEY; else process.env.AITUNNEL_API_KEY = originalKey;
  }
});
