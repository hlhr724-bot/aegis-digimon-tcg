import type { BotArm } from "#api/bot/experiment/BotArm";

export interface BotExperimentArm {
  readonly arm: BotArm;
  readonly weight: number;
}

export interface BotExperiment {
  readonly id: string;
  readonly arms: readonly BotExperimentArm[];
}
