import { createHash } from "node:crypto";

export function getStoryGuestHash(token: unknown): string | undefined {
  if (
    typeof token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
  ) {
    return undefined;
  }
  return createHash("sha256").update(token).digest("hex");
}
