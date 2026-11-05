import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import { BotPlayer } from "#api/bot/BotPlayer";
import { createLevelBotOptions } from "#api/bot/levels/createLevelBotOptions";
import { runReplay } from "#api/replays/inputs/run";
import { asReplayRecord } from "#api/replays/inputs/tools/records";
import { settleAcrossTimers } from "#api/engine/testkit/harness";
import type { Intent, IntentResult } from "@aegis/shared/protocol/intents";

const record = asReplayRecord(
  JSON.parse(readFileSync(new URL("./bot-resumes-after-pending-effect-rollback.replay.json", import.meta.url), "utf8")),
  "bot rollback regression",
);

it("resumes bot actions after replacing an engine paused inside Execute", async () => {
  const previous = await runReplay(record, { untilInput: 75 });
  const restored = await runReplay(record);
  expect(previous.divergences).toEqual([]);
  expect(restored.divergences).toEqual([]);
  const results: { intent: Intent; result: IntentResult }[] = [];
  const original = new BotPlayer(
    1,
    previous.state,
    (intent) => {
      const result = restored.engine.applyIntent(1, intent);
      results.push({ intent, result });
      return result;
    },
    {
      ...createLevelBotOptions({
        engine: previous.engine,
        seat: 1,
        deck: record.seats[1].deck,
        seed: 42,
        difficulty: BotDifficulty.STANDARD.value,
        style: BotStyle.DEFENSIVE.value,
      }),
      thinkDelay: () => new Promise((resolve) => setImmediate(resolve)),
    },
  );
  original.dispose();
  previous.state.gameOver = true;
  previous.engine.decisions.cancel();
  previous.engine.combat.cancel();
  previous.engine.mainPhase.abort();
  previous.engine.breeding.abort();
  const bot = original.restartAfterRollback(restored.engine);
  try {
    bot.resumeAfterRollback();
    await settleAcrossTimers(() => results.length > 0);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.result).toEqual({ ok: true });
  } finally {
    bot.dispose();
    restored.state.gameOver = true;
    restored.engine.decisions.cancel();
    restored.engine.combat.cancel();
    restored.engine.mainPhase.abort();
    restored.engine.breeding.abort();
  }
});
