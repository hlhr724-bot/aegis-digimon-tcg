import { createHash, randomBytes } from "node:crypto";

type Params = { seed?: number };

export function getRoomRandomness({ seed }: Params): { seed: number; randomKey: string } {
  const generatedSeed = randomBytes(4).readUInt32BE(0);
  const testSeed = process.env.NODE_ENV === "test" ? seed : undefined;
  return {
    seed: testSeed ?? generatedSeed,
    randomKey:
      testSeed === undefined
        ? randomBytes(32).toString("hex")
        : createHash("sha256").update(`test-room:${testSeed}`).digest("hex"),
  };
}
