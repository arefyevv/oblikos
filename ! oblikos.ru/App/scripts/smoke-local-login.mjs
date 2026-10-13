import "dotenv/config";
import pg from "pg";
import { hash, argon2id } from "argon2";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const id = randomUUID();
const email = `local-login-${id}@example.com`;
const password = `Local-smoke-${randomUUID()}`;
try {
  await pool.query('INSERT INTO "User" (id,name,email,"updatedAt") VALUES ($1,$2,$3,NOW())', [id, "Local login smoke", email]);
  await pool.query('INSERT INTO "PasswordCredential" (id,"userId","passwordHash","updatedAt") VALUES ($1,$2,$3,NOW())', [randomUUID(), id, await hash(password, { type: argon2id })]);
  for (const origin of ["http://127.0.0.1:3000", "http://localhost:3000"]) {
    const cookies = new Map();
    const request = async (route, init = {}) => {
      const response = await fetch(origin + route, { ...init, redirect: "manual", headers: { ...init.headers, cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; ") } });
      for (const entry of response.headers.getSetCookie()) { const pair = entry.split(";")[0]; const sep = pair.indexOf("="); cookies.set(pair.slice(0,sep), pair.slice(sep+1)); }
      return response;
    };
    const csrf = await (await request("/api/auth/csrf")).json();
    const login = await request("/api/auth/callback/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, json: "true", callbackUrl: origin + "/dashboard" }) });
    const result = await login.json();
    const session = await (await request("/api/auth/session")).json();
    const valid = session?.user?.id === id;
    console.log(JSON.stringify({ origin, status: login.status, callbackOrigin: result.url ? new URL(result.url).origin : null, sessionValid: valid, callbackError: result.url ? new URL(result.url).searchParams.get("error") : null }));
    assert.ok(valid);
  }
} finally {
  await pool.query('DELETE FROM "User" WHERE id=$1', [id]);
  await pool.end();
}
