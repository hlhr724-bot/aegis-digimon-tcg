import { readFile } from "node:fs/promises";
import type { BotExperiment } from "#api/bot/experiment/BotExperiment";
import { parseBotExperiment } from "#api/bot/experiment/parseBotExperiment";

async function readConfiguration(setting: string): Promise<string> {
  if (setting.startsWith("{")) {
    return setting;
  }
  try {
    return await readFile(setting, "utf8");
  } catch (error) {
    throw new Error(`Cannot read the bot experiment file: ${setting}`, { cause: error });
  }
}

export async function loadBotExperiment(environment: NodeJS.ProcessEnv): Promise<BotExperiment | undefined> {
  const setting = environment.AEGIS_BOT_EXPERIMENT?.trim();
  if (!setting) {
    return undefined;
  }
  const text = await readConfiguration(setting);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error("AEGIS_BOT_EXPERIMENT is not valid JSON", { cause: error });
  }
  return parseBotExperiment(value);
}
