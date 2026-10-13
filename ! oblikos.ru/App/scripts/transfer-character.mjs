// Operator-only one-character transfer. Never imports users, credentials or sessions.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, lstat, unlink, chown } from "node:fs/promises";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
require("dotenv").config({ quiet: true });
const { Client } = require("pg");
const [mode, argument, directory] = process.argv.slice(2);
const tables = ["Character", "Appearance", "Personality", "MemoryEntry", "Content", "MediaAsset", "ContentGeneration", "MediaGeneration"];
const jsonColumns = new Map();
const filePattern = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp|mp4)$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const storageRoot = path.resolve(process.env.MEDIA_STORAGE_DIR || path.join(process.cwd(), "data/media"));

async function safeFile(root, key) {
  if (!filePattern.test(key)) throw new Error("Invalid media key");
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, ...key.split("/"));
  if (!target.startsWith(absoluteRoot + path.sep)) throw new Error("Media outside storage");
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error("Symlink in media path"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return target;
}

async function targetWorkspace(db, email) {
  const user = (await db.query('SELECT id FROM "User" WHERE lower(email)=$1', [email.toLowerCase()])).rows;
  if (user.length !== 1) throw new Error("Target account not found or ambiguous");
  const memberships = (await db.query('SELECT w.id,w.name,m.role FROM "WorkspaceMember" m JOIN "Workspace" w ON w.id=m."workspaceId" WHERE m."userId"=$1 ORDER BY m."createdAt",m.id', [user[0].id])).rows;
  if (memberships.length !== 1 || !["OWNER", "ADMIN"].includes(memberships[0].role)) throw new Error("Target workspace is missing, ambiguous or not owned by account");
  return { userId: user[0].id, ...memberships[0] };
}

async function loadBundle(root) {
  const bundle = JSON.parse(await readFile(path.join(root, "bundle.json"), "utf8"));
  if (bundle.version !== 1 || !bundle.rows || !Array.isArray(bundle.files)) throw new Error("Invalid bundle");
  if (bundle.rows.Character?.length !== 1) throw new Error("Exactly one character required");
  const character = bundle.rows.Character[0];
  if (!/^[a-f0-9-]{36}$/i.test(character.id) || !character.name || character.deletedAt) throw new Error("Unexpected source character");
  for (const table of tables) {
    if (!Array.isArray(bundle.rows[table])) throw new Error("Missing table");
    for (const row of bundle.rows[table]) {
      if (table !== "Character" && row.characterId !== character.id) throw new Error("Foreign character row");
      if (row.workspaceId && row.workspaceId !== character.workspaceId) throw new Error("Foreign workspace row");
    }
  }
  if (bundle.files.length !== bundle.rows.MediaAsset.length) throw new Error("Media manifest mismatch");
  for (const file of bundle.files) {
    if (!bundle.rows.MediaAsset.some((row) => row.storageKey === file.key && row.fileSize === file.size)) throw new Error("Unknown media file");
    const bytes = await readFile(await safeFile(path.join(root, "files"), file.key));
    if (bytes.length !== file.size || digest(bytes) !== file.sha256) throw new Error("Media integrity check failed");
  }
  return bundle;
}

async function assertNoConflicts(db, bundle, workspace) {
  const source = bundle.rows.Character[0];
  const duplicate = await db.query('SELECT id FROM "Character" WHERE id=$1 OR ("workspaceId"=$2 AND (slug=$3 OR (name=$4 AND "deletedAt" IS NULL)))', [source.id, workspace.id, source.slug, source.name]);
  if (duplicate.rowCount) throw new Error("Target character already exists; refusing overwrite");
  for (const table of tables) {
    const ids = bundle.rows[table].map((row) => row.id);
    if (ids.length && (await db.query(`SELECT id FROM "${table}" WHERE id=ANY($1::uuid[])`, [ids])).rowCount) throw new Error(`ID conflict in ${table}`);
    const schema = (await db.query('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1', [table])).rows;
    const columns = new Set(schema.map((row) => row.column_name));
    jsonColumns.set(table, new Set(schema.filter((row) => ["json", "jsonb"].includes(row.data_type)).map((row) => row.column_name)));
    for (const row of bundle.rows[table]) if (Object.keys(row).some((key) => !columns.has(key) || !/^[A-Za-z][A-Za-z0-9]*$/.test(key))) throw new Error(`Schema mismatch in ${table}`);
  }
}

const db = new Client({ connectionString: process.env.DATABASE_URL });
const written = [];
let committed = false;
let commitAttempted = false;
try {
  await db.connect();
  if (mode === "inspect-target") {
    const workspace = await targetWorkspace(db, argument);
    const characters = (await db.query('SELECT id,name FROM "Character" WHERE "workspaceId"=$1 AND "deletedAt" IS NULL', [workspace.id])).rows;
    console.log(JSON.stringify({ workspace, characters }));
  } else if (mode === "export" || mode === "export-id") {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const characters = (await db.query(`SELECT row_to_json(t) AS row FROM "Character" t WHERE ${mode === "export-id" ? 'id' : 'name'}=$1 AND "deletedAt" IS NULL`, [argument])).rows;
    if (characters.length !== 1) throw new Error("Source character missing or ambiguous");
    const character = characters[0].row;
    const rows = { Character: [character] };
    for (const table of tables.slice(1)) {
      const condition = table === "MediaAsset" ? ' AND "deletedAt" IS NULL' : table === "MediaGeneration" ? " AND status IN ('READY','FAILED')" : "";
      rows[table] = (await db.query(`SELECT row_to_json(t) AS row FROM "${table}" t WHERE "characterId"=$1${condition}`, [character.id])).rows.map((item) => item.row);
    }
    const activeJobs = (await db.query('SELECT count(*)::int AS count FROM "MediaGeneration" WHERE "characterId"=$1 AND status IN (\'PENDING\',\'PROCESSING\')', [character.id])).rows[0].count;
    if (activeJobs) throw new Error("Finish active media jobs before transfer");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const files = [];
    for (const asset of rows.MediaAsset) {
      const bytes = await readFile(await safeFile(storageRoot, asset.storageKey));
      if (bytes.length !== asset.fileSize) throw new Error("Source file size mismatch");
      const destination = await safeFile(path.join(directory, "files"), asset.storageKey);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
      files.push({ key: asset.storageKey, size: bytes.length, sha256: digest(bytes) });
    }
    await writeFile(path.join(directory, "bundle.json"), JSON.stringify({ version: 1, rows, files }), { flag: "wx", mode: 0o600 });
    await db.query("COMMIT");
    console.log(JSON.stringify({ sourceId: character.id, counts: Object.fromEntries(tables.map((table) => [table, rows[table].length])), mediaBytes: files.reduce((sum, file) => sum + file.size, 0) }));
  } else if (mode === "check" || mode === "import") {
    const bundle = await loadBundle(directory);
    const workspace = await targetWorkspace(db, argument);
    await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await assertNoConflicts(db, bundle, workspace);
    const source = bundle.rows.Character[0];
    if (mode === "check") {
      await db.query("ROLLBACK");
      console.log(JSON.stringify({ ready: true, workspaceId: workspace.id, sourceId: source.id, counts: Object.fromEntries(tables.map((table) => [table, bundle.rows[table].length])) }));
    } else {
      const owner = await lstat(storageRoot);
      for (const file of bundle.files) {
        const key = `${workspace.id}/${source.id}/${path.basename(file.key)}`;
        const target = await safeFile(storageRoot, key);
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        if (process.platform !== "win32") {
          await chown(path.dirname(path.dirname(target)), owner.uid, owner.gid);
          await chown(path.dirname(target), owner.uid, owner.gid);
        }
        const bytes = await readFile(await safeFile(path.join(directory, "files"), file.key));
        await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
        written.push(target);
        if (process.platform !== "win32") await chown(target, owner.uid, owner.gid);
      }
      for (const table of tables) for (const sourceRow of bundle.rows[table]) {
        const row = { ...sourceRow };
        if (row.workspaceId) row.workspaceId = workspace.id;
        if (table === "MediaAsset") row.storageKey = `${workspace.id}/${source.id}/${path.basename(row.storageKey)}`;
        if (table === "MediaGeneration" && row.mediaId && !bundle.rows.MediaAsset.some((asset) => asset.id === row.mediaId)) row.mediaId = null;
        const columns = Object.keys(row);
        await db.query(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`, columns.map((column) => jsonColumns.get(table).has(column) ? JSON.stringify(row[column]) : row[column]));
      }
      commitAttempted = true;
      await db.query("COMMIT");
      committed = true;
      console.log(JSON.stringify({ imported: true, characterId: source.id, workspaceId: workspace.id, files: written.length }));
    }
  } else if (mode === "verify") {
    const bundle = await loadBundle(directory);
    const workspace = await targetWorkspace(db, argument);
    const source = bundle.rows.Character[0];
    const found = await db.query('SELECT id FROM "Character" WHERE id=$1 AND "workspaceId"=$2 AND "deletedAt" IS NULL', [source.id, workspace.id]);
    if (found.rowCount !== 1) throw new Error("Imported character missing");
    for (const table of tables) for (const original of bundle.rows[table]) {
      const expected = { ...original };
      if (expected.workspaceId) expected.workspaceId = workspace.id;
      if (table === "MediaAsset") expected.storageKey = `${workspace.id}/${source.id}/${path.basename(expected.storageKey)}`;
      if (table === "MediaGeneration" && expected.mediaId && !bundle.rows.MediaAsset.some((asset) => asset.id === expected.mediaId)) expected.mediaId = null;
      const actual = (await db.query(`SELECT row_to_json(t) AS row FROM "${table}" t WHERE id=$1`, [expected.id])).rows[0]?.row;
      if (!actual) throw new Error(`Missing record in ${table}`);
      for (const key of ["createdAt", "updatedAt", "deletedAt", "nextPollAt", "pollLeaseUntil"]) {
        if (expected[key]) expected[key] = new Date(expected[key]).toISOString();
        if (actual[key]) actual[key] = new Date(actual[key]).toISOString();
      }
      if (JSON.stringify(canonical(expected)) !== JSON.stringify(canonical(actual))) throw new Error(`Data mismatch in ${table}`);
    }
    for (const table of tables.slice(1)) {
      const count = (await db.query(`SELECT count(*)::int AS count FROM "${table}" WHERE "characterId"=$1`, [source.id])).rows[0].count;
      if (count !== bundle.rows[table].length) throw new Error(`Count mismatch in ${table}`);
    }
    for (const file of bundle.files) {
      const target = await safeFile(storageRoot, `${workspace.id}/${source.id}/${path.basename(file.key)}`);
      const bytes = await readFile(target);
      const stat = await lstat(target);
      const owner = await lstat(storageRoot);
      if (digest(bytes) !== file.sha256 || stat.uid !== owner.uid || stat.gid !== owner.gid) throw new Error("Destination integrity or ownership mismatch");
    }
    console.log(JSON.stringify({ verified: true, characterId: source.id, files: bundle.files.length }));
  } else throw new Error("Mode must be inspect-target, export, export-id, check, import or verify");
} catch (error) {
  await db.query("ROLLBACK").catch(() => undefined);
  // If COMMIT loses its connection, retain staged media until DB verification:
  // removing it could break a transaction that actually committed on the server.
  if (!committed && !commitAttempted) for (const file of written) await unlink(file);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
