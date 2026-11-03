import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DecisionResponse } from "@aegis/shared";
import { runReplay, type ReplayRun } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(
    new URL("./second-bacchusmon-deletes-after-first-removes-played-digimon.replay.json", import.meta.url),
    "utf8",
  ),
) as ReplayRecord;

const firstBacchusmonSuspendInput = 145;
const secondBacchusmonInstanceId = "s0-0a1c1f30026908307e0a1a5ed3ba9088528af087273285f1571c586cbee6aed5";
const playedTapirmonPermanentId = "perm-29";
const opponentMervamonPermanentId = "perm-16";

async function respond(run: ReplayRun, response: DecisionResponse) {
  const pending = run.state.pendingDecision!;
  await run.applyIntent(pending.seat, { type: "respondDecision", decisionId: pending.decisionId, response });
}

function pendingEffectKey(run: ReplayRun): string | undefined {
  const pending = run.state.pendingDecision;
  if (pending === undefined) return undefined;
  return (JSON.parse(pending.payloadJson) as { effectKey?: string }).effectKey;
}

function opponentBattleAreaIds(run: ReplayRun): string[] {
  return run.state.players[1]!.battleArea.map(({ permanentId }) => permanentId);
}

describe("two Bacchusmon triggered by one effect play", () => {
  it("replays the recorded match up to the first Bacchusmon suspend choice", async () => {
    const { divergences } = await runReplay(record, { untilInput: firstBacchusmonSuspendInput });

    expect(divergences).toEqual([]);
  });

  it("still activates the second Bacchusmon play trigger after the first deletes the played Digimon", async () => {
    const run = await runReplay(record, { untilInput: firstBacchusmonSuspendInput });

    await respond(run, { kind: "chooseTargets", instanceIds: [] });

    expect(opponentBattleAreaIds(run)).not.toContain(playedTapirmonPermanentId);
    expect(run.state.pendingDecision?.seat).toBe(0);
    expect(pendingEffectKey(run)).toBe(
      `subtrigger/opt/${secondBacchusmonInstanceId}/printed/suspend/${secondBacchusmonInstanceId}/BT25-077/ir-35-0/0`,
    );

    await respond(run, { kind: "chooseTargets", instanceIds: [] });

    expect(opponentBattleAreaIds(run)).not.toContain(opponentMervamonPermanentId);
  });
});
