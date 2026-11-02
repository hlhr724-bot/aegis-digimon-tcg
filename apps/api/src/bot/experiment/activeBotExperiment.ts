import type { BotExperiment } from "#api/bot/experiment/BotExperiment";
import { loadBotExperiment } from "#api/bot/experiment/loadBotExperiment";
import { log } from "#api/logger";

let active: BotExperiment | undefined;
let loading: Promise<void> | undefined;

async function activate(environment: NodeJS.ProcessEnv): Promise<void> {
  const experiment = await loadBotExperiment(environment);
  if (experiment === undefined) {
    return;
  }
  if (environment.AEGIS_BOT_HEURISTIC || environment.AEGIS_BOT_CHECKPOINT) {
    log(`[bot-experiment] ${experiment.id} stays off because an explicit bot policy is configured`);
    return;
  }
  active = experiment;
  log(`[bot-experiment] ${experiment.id} started`, { arms: experiment.arms });
}

export async function startBotExperiment(environment: NodeJS.ProcessEnv): Promise<void> {
  if (active !== undefined || loading !== undefined) {
    throw new Error("The bot experiment is already started");
  }
  loading = activate(environment);
  try {
    await loading;
  } finally {
    loading = undefined;
  }
}

export async function stopBotExperiment(): Promise<void> {
  await loading?.catch(() => undefined);
  active = undefined;
}

export function getActiveBotExperiment(): BotExperiment | undefined {
  return active;
}
