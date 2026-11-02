import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);

export async function hashTournamentPassword(password: string): Promise<string | null> {
  if (!password) {
    return null;
  }
  if (password.length > 128) {
    throw new RangeError("Tournament passwords must contain at most 128 characters");
  }
  const salt = randomBytes(16).toString("hex");
  const key = (await deriveKey(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
