import { test } from "node:test";
import assert from "node:assert/strict";
import { ProxySpeechProvider, QwenSpeechProvider, SpeechError, speechContentType } from "../src/features/voice/provider";
import { voiceDefaults, voiceSchema, readVoice } from "../src/features/voice/validation";

const settings = { ...voiceDefaults, voiceId: "qwen:Serena" as const };
const endpoint = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const resultUrl = "http://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/sample.wav?Signature=fixture";
const wav = Buffer.alloc(46);
wav.write("RIFF", 0); wav.writeUInt32LE(38, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40);
const result = (url = resultUrl) => Response.json({ output: { audio: { url } } });

test("Qwen selection preserves existing profiles and accepts only supported voices", () => {
  assert.deepEqual(readVoice(voiceDefaults), voiceDefaults);
  assert.deepEqual(voiceSchema.parse(settings), settings);
  assert.equal(voiceSchema.safeParse({ ...settings, voiceId: "qwen:unknown" }).success, false);
});

test("Qwen routing downloads WAV privately without sending storage the API key", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.DASHSCOPE_API_KEY;
  process.env.DASHSCOPE_API_KEY = "qwen-test-key";
  const calls: string[] = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push(String(url));
      if (String(url) === endpoint) {
        assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer qwen-test-key");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.input.voice, "Serena"); assert.equal(body.input.language_type, "Russian");
        assert.match(body.input.instructions, /Warm and friendly/);
        assert.match(body.input.instructions, /Speak slowly/);
        return result();
      }
      assert.equal(String(url), resultUrl.replace("http:", "https:"));
      assert.equal(new Headers(init?.headers).has("Authorization"), false);
      return new Response(wav, { headers: { "Content-Type": "audio/wav" } });
    };
    const bytes = await new ProxySpeechProvider().synthesize({ ...settings, style: "Тёплая", speed: "0.85" }, "Привет! Как дела?");
    assert.deepEqual(bytes, wav); assert.equal(speechContentType(bytes), "audio/wav"); assert.equal(calls.length, 2);
    assert.equal(speechContentType(Buffer.from("ID3voice")), "audio/mpeg");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY; else process.env.DASHSCOPE_API_KEY = originalKey;
  }
});

test("missing key and unsupported instruction language stop without paid requests", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.DASHSCOPE_API_KEY;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw new Error("Unexpected network call"); };
    delete process.env.DASHSCOPE_API_KEY;
    await assert.rejects(new QwenSpeechProvider().synthesize(settings, "Привет"), (e: unknown) => e instanceof SpeechError && e.code === "qwenConfiguration");
    process.env.DASHSCOPE_API_KEY = "qwen-test-key";
    await assert.rejects(new QwenSpeechProvider().synthesize({ ...settings, instructions: "Говори мягко" }, "Привет"), (e: unknown) => e instanceof SpeechError && e.code === "qwenInstructions");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY; else process.env.DASHSCOPE_API_KEY = originalKey;
  }
});

test("provider errors never retry or fall back to another paid provider", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.DASHSCOPE_API_KEY;
  process.env.DASHSCOPE_API_KEY = "qwen-test-key";
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response("failure", { status: 503 }); };
    await assert.rejects(new ProxySpeechProvider().synthesize(settings, "Привет"), SpeechError);
    assert.equal(calls, 1);
    globalThis.fetch = async () => Response.json({ code: "Arrearage" });
    await assert.rejects(new QwenSpeechProvider().synthesize(settings, "Привет"), (e: unknown) => e instanceof SpeechError && e.code === "balance");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY; else process.env.DASHSCOPE_API_KEY = originalKey;
  }
});

test("untrusted URLs, redirects and invalid or oversized audio are rejected", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.DASHSCOPE_API_KEY;
  process.env.DASHSCOPE_API_KEY = "qwen-test-key";
  try {
    for (const url of ["http://127.0.0.1/private", "https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com.evil.test/a.wav", "https://user:password@dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/a.wav"]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return result(url); };
      await assert.rejects(new QwenSpeechProvider().synthesize(settings, "Привет"), SpeechError);
      assert.equal(calls, 1);
    }
    for (const audio of [new Response("not audio"), new Response(null, { status: 302, headers: { Location: "http://127.0.0.1" } }), new Response("too big", { headers: { "Content-Length": String(9 * 1024 * 1024) } })]) {
      globalThis.fetch = async (url, init) => {
        assert.equal(init?.redirect, "error");
        return String(url) === endpoint ? result() : audio;
      };
      await assert.rejects(new QwenSpeechProvider().synthesize(settings, "Привет"), SpeechError);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY; else process.env.DASHSCOPE_API_KEY = originalKey;
  }
});
