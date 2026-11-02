import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import { Phase } from "@aegis/shared/schema/enums";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./execute-deletion-survives-digivolution.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Execute deletion survives digivolution", () => {
  it("deletes Millenniummon after Reapermon evolves through inherited Pagumon during Execute", async () => {
    const replay = await runReplay(record, { untilInput: 75 });
    try {
      expect(replay.divergences).toEqual([]);
      const player = replay.state.players[0]!;
      expect(player.battleArea.find((permanent) => permanent.permanentId === "perm-2")?.topCard.cardId).toBe(
        "BT26-077",
      );
      for (const input of record.inputs.slice(75)) {
        if (input.kind !== "intent" || input.intent.type !== "respondDecision") {
          throw new Error("Expected an attack resolution decision");
        }
        const pending = replay.state.pendingDecision!;
        expect(pending.kind).toBe(input.intent.response.kind);
        expect(await replay.applyIntent(input.seat, { ...input.intent, decisionId: pending.decisionId })).toEqual({
          ok: true,
        });
      }
      expect(player.battleArea.some((permanent) => permanent.permanentId === "perm-2")).toBe(false);
      expect(player.trash.some((card) => card.cardId === "P-220" && card.instanceId === "s0-38")).toBe(true);
      expect(player.trash.some((card) => card.cardId === "BT26-077" && card.instanceId === "s0-31")).toBe(true);
      const deletion = replay.state.pendingDecision!;
      expect(JSON.parse(deletion.payloadJson)).toMatchObject({ effectKey: "P-220/on-deletion" });
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: deletion.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      const delay = replay.state.pendingDecision!;
      expect(JSON.parse(delay.payloadJson)).toMatchObject({ timing: "StartOfYourTurn", effectKey: "LM-029/ir-0-0" });
      expect(
        await replay.applyIntent(1, {
          type: "respondDecision",
          decisionId: delay.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      expect(replay.state.pendingDecision).toBeUndefined();
      expect(replay.state.turnSeat).toBe(1);
      expect(replay.state.phase).toBe(Phase.Breeding);
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
