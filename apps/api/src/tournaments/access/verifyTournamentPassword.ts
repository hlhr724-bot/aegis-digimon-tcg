import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
type Params = { password: unknown; passwordHash: string | null | undefined };

export async function verifyTournamentPassword({ password, passwordHash }: Params): Promise<boolean> {
  if (!passwordHash) {
    return true;
  }
  if (typeof password !== "string" || !password || password.length > 128) {
    return false;
  }
  const parts = passwordHash.split(":");
  const [salt, expected] = parts;
  if (parts.length !== 2 || !salt || !expected || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expected)) {
    return false;
  }
  const actual = (await deriveKey(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
