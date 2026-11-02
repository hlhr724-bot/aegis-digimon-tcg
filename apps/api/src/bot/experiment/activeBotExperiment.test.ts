import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startBotInference, stopBotInference } from "#api/bot/inferenceRuntime";
import { getActiveBotExperiment, startBotExperiment, stopBotExperiment } from "#api/bot/experiment/activeBotExperiment";

const CONFIGURATION = '{"id":"bot-ab-2026-10","arms":{"certified":50,"humanPanelPlanner":50}}';
let directory: string | undefined;

afterEach(async () => {
  await stopBotExperiment();
  await stopBotInference();
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
  directory = undefined;
});

describe("bot experiment startup", () => {
  it.each([
    ["missing", {}],
    ["empty", { AEGIS_BOT_EXPERIMENT: "  " }],
  ])("stays off when the setting is %s", async (_case, environment) => {
    await startBotExperiment(environment);
    expect(getActiveBotExperiment()).toBeUndefined();
  });

  it("reads inline JSON", async () => {
    await startBotExperiment({ AEGIS_BOT_EXPERIMENT: CONFIGURATION });
    expect(getActiveBotExperiment()?.id).toBe("bot-ab-2026-10");
  });

  it("reads a configuration file path", async () => {
    directory = await mkdtemp(join(tmpdir(), "aegis-bot-experiment-"));
    const path = join(directory, "experiment.json");
    await writeFile(path, CONFIGURATION);
    await startBotExperiment({ AEGIS_BOT_EXPERIMENT: path });
    expect(getActiveBotExperiment()?.arms).toEqual([
      { arm: "certified", weight: 50 },
      { arm: "humanPanelPlanner", weight: 50 },
    ]);
  });

  it.each([
    ["malformed JSON", "{not json", "not valid JSON"],
    ["a missing file", "/nonexistent/aegis-bot-experiment.json", "Cannot read the bot experiment file"],
    ["bad weights", '{"id":"bot-ab","arms":{"certified":40}}', "sum to 100"],
  ])("fails server startup on %s", async (_case, setting, message) => {
    await expect(startBotInference({ AEGIS_BOT_EXPERIMENT: setting })).rejects.toThrow(message);
    expect(getActiveBotExperiment()).toBeUndefined();
  });

  it("keeps an explicit heuristic or checkpoint policy and leaves the experiment off", async () => {
    await startBotExperiment({ AEGIS_BOT_EXPERIMENT: CONFIGURATION, AEGIS_BOT_CHECKPOINT: "checkpoint.pt" });
    expect(getActiveBotExperiment()).toBeUndefined();
    await startBotExperiment({ AEGIS_BOT_EXPERIMENT: CONFIGURATION, AEGIS_BOT_HEURISTIC: "catalog.json" });
    expect(getActiveBotExperiment()).toBeUndefined();
  });

  it("is cleared when bot inference stops", async () => {
    await startBotInference({ AEGIS_BOT_EXPERIMENT: CONFIGURATION });
    expect(getActiveBotExperiment()).toBeDefined();
    await stopBotInference();
    expect(getActiveBotExperiment()).toBeUndefined();
  });

  it("stays off when shutdown arrives while the configuration loads", async () => {
    directory = await mkdtemp(join(tmpdir(), "aegis-bot-experiment-"));
    const path = join(directory, "experiment.json");
    await writeFile(path, CONFIGURATION);
    await Promise.all([startBotInference({ AEGIS_BOT_EXPERIMENT: path }), stopBotInference()]);
    expect(getActiveBotExperiment()).toBeUndefined();
  });
});
