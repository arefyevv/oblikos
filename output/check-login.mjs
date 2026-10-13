import pg from '/opt/oblikos/current/node_modules/pg/lib/index.js';
import { createHmac } from 'node:crypto';
import argon2 from '/opt/oblikos/current/node_modules/argon2/argon2.cjs';
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
try {
  const rates = await pool.query('SELECT attempts, "expiresAt" FROM "AuthRateLimit" WHERE "expiresAt" > NOW() ORDER BY attempts DESC LIMIT 10');
  const sessions = await pool.query('SELECT COUNT(*)::int AS active, COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL \'1 hour\')::int AS recent FROM "AuthSession" WHERE "expiresAt" > NOW()');
  const accounts = await pool.query('SELECT COUNT(*)::int AS users, COUNT(p.id)::int AS passwords FROM "User" u LEFT JOIN "PasswordCredential" p ON p."userId" = u.id');
  const users = await pool.query('SELECT email FROM "User"');
  const accountAttempts = [];
  for (const {email} of users.rows) {
    const key = createHmac('sha256', process.env.AUTH_SECRET).update(`login-email:${email}`).digest('hex');
    const result = await pool.query('SELECT attempts, "expiresAt" FROM "AuthRateLimit" WHERE key=$1 AND "expiresAt" > NOW()', [key]);
    accountAttempts.push(result.rows[0] || {attempts:0});
  }
  const knownAccount = await pool.query('SELECT u.email=$1 AS "emailMatches", split_part(p."passwordHash", \'$\', 2) AS algorithm, length(p."passwordHash") AS "hashLength", p."updatedAt" FROM "User" u JOIN "PasswordCredential" p ON p."userId"=u.id', ['viktor082rus@gmail.com']);
  const probeHash = await argon2.hash('offline-runtime-probe');
  const cryptoWorks = await argon2.verify(probeHash, 'offline-runtime-probe');
  console.log(JSON.stringify({rates: rates.rows, sessions: sessions.rows, accounts: accounts.rows, accountAttempts,knownAccount:knownAccount.rows,cryptoWorks}));
} finally { await pool.end(); }
