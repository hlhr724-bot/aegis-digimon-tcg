import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SequencedServerEvent } from "@aegis/shared/protocol/events";
import { Phase } from "@aegis/shared/schema/enums";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./free-tamer-play-before-automatic-pass.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Free Tamer play before automatic pass", () => {
  it.each([true, false])("charges no memory when accepting the free play is %s", async (accept) => {
    const events: SequencedServerEvent[] = [];
    const replay = await runReplay(record, {
      untilInput: 50,
      onBatch(_state, batch) {
        events.push(...batch);
      },
    });
    try {
      expect(replay.divergences).toEqual([]);
      expect(replay.state.memory).toBe(0);
      expect(replay.state.turnSeat).toBe(1);
      const player = replay.state.players[1]!;
      expect(player.hand.map((card) => card.cardId).sort()).toEqual(["BT12-057", "BT12-094"]);
      events.length = 0;
      expect(
        await replay.applyIntent(1, {
          type: "respondDecision",
          decisionId: replay.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
      const changes = events.filter((event) => event.kind === "memoryChanged");
      expect(changes.filter((event) => event.reason !== "passTurn")).toEqual([]);
      expect(player.battleArea.some((permanent) => permanent.topCard.cardId === "BT12-094")).toBe(accept);
      expect(replay.state.pendingDecision).toBeUndefined();
      const expected = accept
        ? {
            hand: ["BT12-057"],
            changes: [{ from: 0, to: -3, reason: "passTurn" }],
            seat: 0,
            memory: 3,
            phase: Phase.Breeding,
          }
        : { hand: ["BT12-057", "BT12-094"], changes: [], seat: 1, memory: 0, phase: Phase.Main };
      expect(player.hand.map((card) => card.cardId).sort()).toEqual(expected.hand);
      expect(changes.map(({ from, to, reason }) => ({ from, to, reason }))).toEqual(expected.changes);
      expect(replay.state.turnSeat).toBe(expected.seat);
      expect(replay.state.memory).toBe(expected.memory);
      expect(replay.state.phase).toBe(expected.phase);
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
