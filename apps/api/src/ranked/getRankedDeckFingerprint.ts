import { createHash } from "node:crypto";

type Params = { mainDeck: readonly string[]; eggDeck: readonly string[] };

export function getRankedDeckFingerprint({ mainDeck, eggDeck }: Params): string {
  return createHash("sha256")
    .update(JSON.stringify([[...mainDeck].sort(), [...eggDeck].sort()]))
    .digest("hex");
}
