import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./soloogarmon-unsuspend-requires-opponent-memory.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

const secondAttackIndex = 50;

it("keeps an attacker with inherited Soloogarmon suspended after attacking while the opponent has no memory", async () => {
  const secondAttack = record.inputs[secondAttackIndex];
  if (secondAttack?.kind !== "intent" || secondAttack.intent.type !== "attack") {
    throw new Error("the fixture's second attack input moved");
  }
  const attackerPermanentId = secondAttack.intent.attackerPermanentId;
  const replay = await runReplay(record, { untilInput: secondAttackIndex });
  try {
    const attacker = replay.state.players[1]!.battleArea.find(
      (permanent) => permanent.permanentId === attackerPermanentId,
    );

    expect(replay.state.turnSeat).toBe(1);
    expect(replay.state.memory).toBe(0);
    expect(attacker?.topCard?.cardId).toBe("BT20-035");
    expect(attacker?.stack.some((card) => card.cardId === "BT16-076")).toBe(true);
    expect(attacker?.isSuspended).toBe(true);
    expect(replay.engine.applyIntent(1, secondAttack.intent).ok).toBe(false);
  } finally {
    await replay.applyIntent(1, { type: "surrender" });
  }
});
