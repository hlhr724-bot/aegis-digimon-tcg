import type { BotArm } from "#api/bot/experiment/BotArm";

export interface BotExperimentRecord {
  botExperiment: string;
  botArm: BotArm;
  botArmFallback?: true;
}
