import { createHash } from "node:crypto";
import type { BotArm } from "#api/bot/experiment/BotArm";
import type { BotExperiment } from "#api/bot/experiment/BotExperiment";

interface AssignBotArmParams {
  experiment: BotExperiment;
  matchId: string;
}

const BUCKETS = 100;

export function assignBotArm({ experiment, matchId }: AssignBotArmParams): BotArm {
  const digest = createHash("sha256").update(`${experiment.id}\u0000${matchId}`).digest();
  const bucket = Math.floor((digest.readUInt32BE(0) / 2 ** 32) * BUCKETS);
  let threshold = 0;
  for (const entry of experiment.arms) {
    threshold += entry.weight;
    if (bucket < threshold) {
      return entry.arm;
    }
  }
  throw new Error(`Bot experiment ${experiment.id} weights do not cover bucket ${bucket}`);
}
