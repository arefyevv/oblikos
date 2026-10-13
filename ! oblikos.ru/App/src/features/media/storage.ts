import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, lstat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { z } from "zod";
import { ImageError } from "@/features/ai/image-types";
import { maxImageBytes } from "./image-file";
import { maxVideoBytes } from "./video-file";
import { mediaStorageDirectory, probeMediaStorage } from "@/lib/server/environment";

async function rejectSymlinkPath(target: string) {
  const base = path.parse(target).root;
  let current = base;
  for (const segment of target.slice(base.length).split(path.sep)) {
    current = path.join(current, segment);
    try { if ((await lstat(current)).isSymbolicLink()) throw new ImageError("storage"); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  }
}

export async function checkMediaStorage() {
  const root = mediaStorageDirectory();
  // Operators provision the production root; don't silently create a wrong path.
  if (process.env.NODE_ENV !== "production") await mkdir(root, { recursive: true, mode: 0o700 });
  await probeMediaStorage(root);
}

export type StorageFile = { size: number; close(): Promise<void>; stream(start?: number, end?: number): ReadableStream<Uint8Array> };

export interface StorageProvider {
  save(input: { workspaceId: string; characterId: string; extension: string; bytes: Buffer }): Promise<string>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  open?(key: string): Promise<StorageFile>;
}
const keyPattern = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp|mp4|wav|mp3)$/;
const limit = (key: string) => key.endsWith(".mp4") ? maxVideoBytes : /\.(wav|mp3)$/.test(key) ? 10 * 1024 * 1024 : maxImageBytes;
export class LocalStorageProvider implements StorageProvider {
  constructor(private directory?: string) {}
  private root() {
    try { return this.directory ? path.resolve(/* turbopackIgnore: true */ this.directory) : mediaStorageDirectory(); }
    catch { throw new ImageError("configuration"); }
  }
  private async file(key: string) {
    if (!keyPattern.test(key)) throw new ImageError("storage");
    const root = this.root();
    const target = path.resolve(root, ...key.split("/"));
    if (!target.startsWith(root + path.sep)) throw new ImageError("storage");
    // Do not follow links within the private storage tree.
    await rejectSymlinkPath(target);
    return target;
  }
  async save(input: { workspaceId: string; characterId: string; extension: string; bytes: Buffer }) {
    z.uuid().parse(input.workspaceId); z.uuid().parse(input.characterId);
    z.enum(["png", "jpg", "webp", "mp4", "wav", "mp3"]).parse(input.extension);
    if (input.bytes.length > limit(`file.${input.extension}`)) throw new ImageError("storage");
    const key = `${input.workspaceId}/${input.characterId}/${randomUUID()}.${input.extension}`;
    try {
      const target = await this.file(key);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await rejectSymlinkPath(target);
      await writeFile(target, input.bytes, { flag: "wx", mode: 0o600 });
      return key;
    } catch { await this.delete(key).catch(() => undefined); throw new ImageError("storage"); }
  }
  async read(key: string) {
    try {
      const target = await this.file(key);
      const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > limit(key)) throw new ImageError("storage");
        return await handle.readFile();
      } finally { await handle.close(); }
    } catch { throw new ImageError("storage"); }
  }
  async open(key: string): Promise<StorageFile> {
    const handle = await open(await this.file(key), constants.O_RDONLY | (constants.O_NOFOLLOW || 0)).catch(() => { throw new ImageError("storage"); });
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size <= 0 || stat.size > limit(key)) throw new ImageError("storage");
      return { size: stat.size, close: () => handle.close(), stream: (start = 0, end = stat.size - 1) => Readable.toWeb(handle.createReadStream({ start, end, autoClose: true })) as ReadableStream<Uint8Array> };
    } catch { await handle.close(); throw new ImageError("storage"); }
  }
  async delete(key: string) {
    try { await unlink(await this.file(key)); }
    catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return; throw new ImageError("storage"); }
  }
}
