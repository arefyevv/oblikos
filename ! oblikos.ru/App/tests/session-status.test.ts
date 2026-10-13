import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";
import { missingSessionStatus } from "../src/features/auth/session-status";

const environment = { secret: randomBytes(48).toString("base64url"), secure: false };
const userId = randomUUID();
const sessionId = randomUUID();
const noLookup = async (): Promise<never> => { throw new Error("Unexpected database lookup"); };
const cookie = (value: string, secure = false) => [{ name: secure ? "__Secure-next-auth.session-token" : "next-auth.session-token", value }];

test("absent and unrelated cookies are unauthenticated, without a DB lookup", async () => {
  assert.equal(await missingSessionStatus([], environment, noLookup), "unauthenticated");
  assert.equal(await missingSessionStatus([{ name: "next-auth.csrf-token", value: "anything" }], environment, noLookup), "unauthenticated");
});

test("corrupt and wrong-secret cookies do not prove a previous session", async () => {
  assert.equal(await missingSessionStatus(cookie("corrupt"), environment, noLookup), "unauthenticated");
  const wrong = await encode({ token: { sub: userId, sid: sessionId }, secret: "another-secret", maxAge: -60 });
  assert.equal(await missingSessionStatus(cookie(wrong), environment, noLookup), "unauthenticated");
});

test("authentic expired JWT is distinguished without accepting it for access", async () => {
  const token = await encode({ token: { sub: userId, sid: sessionId }, secret: environment.secret, maxAge: -60 });
  assert.equal(await missingSessionStatus(cookie(token), environment, noLookup), "expired");
});

test("valid JWT with missing, expired or mismatched registry record is expired", async () => {
  const token = await encode({ token: { sub: userId, sid: sessionId }, secret: environment.secret });
  for (const record of [null, { userId, expiresAt: new Date(0) }, { userId: randomUUID(), expiresAt: new Date(Date.now() + 60000) }]) {
    assert.equal(await missingSessionStatus(cookie(token), environment, async (id) => { assert.equal(id, sessionId); return record; }), "expired");
  }
  assert.equal(await missingSessionStatus(cookie(token), environment, async () => ({ userId, expiresAt: new Date(Date.now() + 60000) })), "unauthenticated");
});

test("production secure cookies and split cookies are supported", async () => {
  const token = await encode({ token: { sub: userId, sid: sessionId }, secret: environment.secret, maxAge: -60 });
  const secure = { ...environment, secure: true };
  assert.equal(await missingSessionStatus(cookie(token, true), secure, noLookup), "expired");
  assert.equal(await missingSessionStatus(cookie(token), secure, noLookup), "unauthenticated");
  const half = Math.floor(token.length / 2);
  assert.equal(await missingSessionStatus([
    { name: "__Secure-next-auth.session-token.1", value: token.slice(half) },
    { name: "__Secure-next-auth.session-token.0", value: token.slice(0, half) },
  ], secure, noLookup), "expired");
});
