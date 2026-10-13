import assert from "node:assert/strict";
import { test } from "node:test";
import nodemailer from "nodemailer";
import dns from "node:dns/promises";
import { emailAvailable, emailProvider } from "../src/features/auth/email";

test("SMTP works in production, fails closed on incomplete config, and hides transport errors", async (t) => {
  const values = {
    NODE_ENV: "production", EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "sender@example.com",
    SMTP_PASSWORD: "test-secret", SMTP_FROM: "Oblik OS <sender@example.com>",
  };
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  assert.equal(emailAvailable(), true);
  t.mock.method(dns, "lookup", async () => ({ address: "127.0.0.1", family: 4 }));
  const realCreate = nodemailer.createTransport;
  // Real MIME generation, offline. SMTP acceptance is simulated separately.
  const send = t.mock.method(nodemailer, "createTransport", (options: { secure: boolean }) => {
    const transport = realCreate({ streamTransport: true, buffer: true });
    return {
      async sendMail(message: Parameters<typeof transport.sendMail>[0]) {
        const result = await transport.sendMail(message);
        const mime = result.message.toString();
        assert.match(mime, /From: Oblik OS <sender@example.com>/);
        const body = Buffer.from(mime.split("\r\n\r\n")[1].replace(/\s/g, ""), "base64").toString("utf8");
        assert.match(body, /https:\/\/app.oblikos.ru\/verify-email\?token=test/);
        assert.equal(mime.includes("test-secret"), false);
        assert.equal(options.secure, true);
        return { accepted: ["recipient@example.com"], rejected: [] };
      },
    };
  });
  await emailProvider().send({ to: "recipient@example.com", subject: "Verify", url: "https://app.oblikos.ru/verify-email?token=test" });
  send.mock.restore();
  t.mock.method(nodemailer, "createTransport", () => ({
    async sendMail() { throw new Error("test-secret SMTP details"); },
  }));
  await assert.rejects(emailProvider().send({ to: "recipient@example.com", subject: "Verify", url: "https://app.oblikos.ru/verify-email" }), /^Error: Email delivery failed$/);
  delete process.env.SMTP_PASSWORD;
  assert.equal(emailAvailable(), false);
  assert.throws(emailProvider, /not configured/);
  process.env.EMAIL_PROVIDER = "development";
  assert.equal(emailAvailable(), false);
});
