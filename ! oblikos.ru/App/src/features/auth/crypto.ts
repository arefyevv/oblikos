import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { argon2id, hash, verify } from "argon2";

export const tokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const randomToken = () => randomBytes(32).toString("hex");
export const hashPassword = (password: string) =>
  hash(password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
let dummyHash: Promise<string> | undefined;
export async function verifyPassword(
  passwordHash: string | undefined,
  password: string,
) {
  dummyHash ??= hashPassword(randomToken());
  const target = passwordHash ?? (await dummyHash);
  const valid = await verify(target, password).catch(() => false);
  return Boolean(passwordHash && valid);
}
