import type { BotExperiment, BotExperimentArm } from "#api/bot/experiment/BotExperiment";
import { isBotArm } from "#api/bot/experiment/isBotArm";

const EXPERIMENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const TOTAL_WEIGHT = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArms(value: unknown): BotExperimentArm[] {
  if (!isPlainObject(value)) {
    throw new Error("Bot experiment arms must be an object of arm names to weights");
  }
  const arms = Object.entries(value).map(([arm, weight]) => {
    if (!isBotArm(arm)) {
      throw new Error(`Unknown bot experiment arm: ${arm}`);
    }
    if (typeof weight !== "number" || !Number.isSafeInteger(weight) || weight < 1 || weight > TOTAL_WEIGHT) {
      throw new Error(`Bot experiment arm ${arm} needs an integer weight from 1 to ${TOTAL_WEIGHT}`);
    }
    return { arm, weight };
  });
  const total = arms.reduce((sum, arm) => sum + arm.weight, 0);
  if (total !== TOTAL_WEIGHT) {
    throw new Error(`Bot experiment arm weights must sum to ${TOTAL_WEIGHT}, not ${total}`);
  }
  return arms;
}

export function parseBotExperiment(value: unknown): BotExperiment {
  if (!isPlainObject(value)) {
    throw new Error("Bot experiment configuration must be a JSON object");
  }
  const unknownKeys = Object.keys(value).filter((key) => key !== "id" && key !== "arms");
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown bot experiment fields: ${unknownKeys.join(", ")}`);
  }
  if (typeof value.id !== "string" || !EXPERIMENT_ID_PATTERN.test(value.id)) {
    throw new Error("Bot experiment id must be 3 to 64 lowercase letters, digits, or hyphens");
  }
  return { id: value.id, arms: parseArms(value.arms) };
}
