import { test } from "node:test";
import assert from "node:assert/strict";
import { ProxySpeechProvider, SpeechError } from "../src/features/voice/provider";
import { voiceDefaults } from "../src/features/voice/validation";

test("AITUNNEL routes Qwen with its own key, rejects invalid audio and never falls back", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.AITUNNEL_API_KEY;
  const settings = { ...voiceDefaults, voiceId: "qwen-flash:loongjohn" as const };
  let calls = 0;
  try {
    process.env.AITUNNEL_API_KEY = "test-aitunnel-key";
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), "https://api.aitunnel.ru/v1/audio/speech");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-aitunnel-key");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "qwen-audio-3.0-tts-flash", voice: "loongjohn", input: "Привет", response_format: "mp3",
      });
      return new Response(Buffer.from("ID3sample"), { headers: { "Content-Type": "audio/mpeg" } });
    };
    assert.equal((await new ProxySpeechProvider().synthesize(settings, "Привет")).toString(), "ID3sample");
    assert.equal(calls, 1);
    globalThis.fetch = async () => { calls++; return new Response("failure", { status: 402 }); };
    await assert.rejects(new ProxySpeechProvider().synthesize(settings, "Привет"), (e: unknown) => e instanceof SpeechError && e.code === "balance");
    assert.equal(calls, 2);
    globalThis.fetch = async () => new Response("not audio", { headers: { "Content-Type": "audio/mpeg" } });
    await assert.rejects(new ProxySpeechProvider().synthesize(settings, "Привет"), (e: unknown) => e instanceof SpeechError && e.code === "response");
    delete process.env.AITUNNEL_API_KEY;
    globalThis.fetch = async () => { throw new Error("Must not call without key"); };
    await assert.rejects(new ProxySpeechProvider().synthesize(settings, "Привет"), (e: unknown) => e instanceof SpeechError && e.code === "aitunnelConfiguration");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AITUNNEL_API_KEY; else process.env.AITUNNEL_API_KEY = originalKey;
  }
});
