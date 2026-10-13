// Pure Node module shared by Next config startup and server-only runtime wrappers.
// Relative .ts imports also work with Node 24's native TypeScript config loader.
import path from "node:path";
import { lstat, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { databaseUrlSchema } from "./env.ts";

export function productionAuthEnvironment() {
  const secret = process.env.AUTH_SECRET;
  const value = process.env.NEXTAUTH_URL;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  if (!value || !URL.canParse(value)) throw new Error("NEXTAUTH_URL must be a canonical origin");
  const origin = new URL(value);
  if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password || !["https:", "http:"].includes(origin.protocol)) throw new Error("NEXTAUTH_URL must be a canonical HTTP(S) origin");
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:" && !(process.env.AUTH_LOCAL_HTTP === "true" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw new Error("Production auth requires HTTPS");
  return { secret, origin: origin.origin, secure: origin.protocol === "https:" };
}

export function mediaStorageDirectory(configured = process.env.MEDIA_STORAGE_DIR, production = process.env.NODE_ENV === "production", cwd = process.cwd()) {
  const value = configured?.trim();
  if (production && (!value || !path.isAbsolute(value))) throw new Error("Production requires absolute MEDIA_STORAGE_DIR");
  const root = path.resolve(/* turbopackIgnore: true */ value || path.join(cwd, "data", "media"));
  const relative = path.relative(cwd, root);
  if (production && (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)))) throw new Error("MEDIA_STORAGE_DIR must be outside application directory");
  if (root.split(path.sep).some((s) => ["public", ".next", ".next-e2e", "node_modules", "tmp", "temp"].includes(s.toLowerCase()))) throw new Error("MEDIA_STORAGE_DIR must be persistent private storage");
  return root;
}

export function validateProductionEnvironment() {
  if (!databaseUrlSchema.safeParse(process.env.DATABASE_URL).success) throw new Error("Missing or invalid DATABASE_URL");
  productionAuthEnvironment();
  mediaStorageDirectory();
}

export async function probeMediaStorage(root: string) {
  const probe = path.join(root, `.health-${randomUUID()}`);
  try {
    let current = path.parse(root).root;
    for (const segment of root.slice(current.length).split(path.sep)) {
      current = path.join(current, segment);
      if ((await lstat(current)).isSymbolicLink()) throw new Error("Symlink");
    }
    if (!(await lstat(root)).isDirectory()) throw new Error("NotDirectory");
    await writeFile(probe, "", { flag: "wx", mode: 0o600 });
    await unlink(probe);
  } catch { throw new Error("MEDIA_STORAGE_DIR must exist, be private, writable and contain no symlink ancestors"); }
}
