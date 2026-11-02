import { createHash } from "node:crypto";

type Params = { compositionKey: string };

export function buildDeckCompositionSignature({ compositionKey }: Params): string {
  return createHash("sha256").update(compositionKey).digest("hex");
}
