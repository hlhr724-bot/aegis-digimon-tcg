import { BotArm } from "#api/bot/experiment/BotArm";

export function isBotArm(value: unknown): value is BotArm {
  return typeof value === "string" && Object.values(BotArm).some((entry) => entry.value === value);
}
