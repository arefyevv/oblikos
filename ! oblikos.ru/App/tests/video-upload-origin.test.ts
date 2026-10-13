import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/video-sources/route";

test("video upload accepts the configured HTTPS origin behind an HTTP proxy and rejects other origins", async () => {
  const previousUrl = process.env.NEXTAUTH_URL;
  const previousSecret = process.env.AUTH_SECRET;
  process.env.NEXTAUTH_URL = "https://app.oblikos.ru";
  process.env.AUTH_SECRET = "test-only-upload-origin-secret-at-least-32-characters";
  try {
    // No body: an accepted origin reaches the size check before auth or storage.
    const accepted = await POST(new Request("http://127.0.0.1:3000/api/video-sources", {
      method: "POST", headers: { origin: "https://app.oblikos.ru" },
    }));
    assert.equal(accepted.status, 413);
    for (const origin of ["https://other.example", "https://app.oblikos.ru.other.example", "null", "http://127.0.0.1:3000", undefined]) {
      const response = await POST(new Request("http://127.0.0.1:3000/api/video-sources", {
        method: "POST", headers: origin ? { origin } : {},
      }));
      assert.equal(response.status, 403);
    }
  } finally {
    if (previousUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});
