import "#api/cards/index";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(
    new URL("./arts-digivolve-inside-effect-resolves-turn-player-entry-effects-first.replay.json", import.meta.url),
    "utf8",
  ),
) as ReplayRecord;

const outerEffectKey = "ST23-04/ir-7-0";
const turnPlayerEntryEffectKey = "BT25-043/ir-shared-0";
const opponentEntryEffectKey = "EX13-045/ir-7-0";

function eventIndex(events: readonly ServerEvent[], kind: ServerEvent["kind"], effectKey: string): number {
  return events.findIndex((event) => event.kind === kind && "effectKey" in event && event.effectKey === effectKey);
}

describe("Arts Digivolve used by a resolving effect", () => {
  it("resolves the turn player's [When Digivolving] before the opponent's entry effect from the rule-check deletion", async () => {
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, { untilInput: 142, onBatch: (_state, batch) => events.push(...batch) });

    expect(replay.divergences.filter(({ index }) => index < 141)).toEqual([]);
    expect(eventIndex(events, "effectTriggered", "replacement/keyword-partition/perm-18")).toBeGreaterThanOrEqual(0);
    expect(eventIndex(events, "effectResolved", outerEffectKey)).toBeGreaterThanOrEqual(0);
    expect(eventIndex(events, "effectTriggered", turnPlayerEntryEffectKey)).toBeGreaterThan(
      eventIndex(events, "effectResolved", outerEffectKey),
    );
    expect(eventIndex(events, "effectTriggered", opponentEntryEffectKey)).toBe(-1);

    const securityPrompt = replay.state.pendingDecision!;
    expect(securityPrompt).toMatchObject({ seat: 1, kind: "selectCards" });
    expect(
      await replay.applyIntent(1, {
        type: "respondDecision",
        decisionId: securityPrompt.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });

    expect(eventIndex(events, "effectResolved", turnPlayerEntryEffectKey)).toBeGreaterThanOrEqual(0);
    expect(eventIndex(events, "effectTriggered", opponentEntryEffectKey)).toBeGreaterThan(
      eventIndex(events, "effectResolved", turnPlayerEntryEffectKey),
    );
    expect(replay.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toContain("EX13-045");
  });
});
