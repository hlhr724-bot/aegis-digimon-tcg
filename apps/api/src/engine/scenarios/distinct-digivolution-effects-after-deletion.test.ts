import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SequencedServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record: ReplayRecord = JSON.parse(
  readFileSync(new URL("./distinct-digivolution-effects-after-deletion.replay.json", import.meta.url), "utf8"),
);

describe("distinct digivolution effects interrupted by an On Deletion play", () => {
  it("resolves each Gallantmon deletion once and does not reuse its shared limit when attacking", async () => {
    const events: SequencedServerEvent[] = [];
    const run = await runReplay(record, {
      untilInput: 216,
      onBatch(_state, batch) {
        events.push(...batch);
      },
    });
    try {
      expect(run.divergences).toEqual([]);
      expect(run.pendingRequest?.options).toMatchObject({
        selectionContext: "attackTarget",
        effectText:
          "[When Digivolving] Delete up to 10000 DP total worth of your opponent's Digimon. Then, this Digimon may attack.",
        effectTextEmphasis: "Then, this Digimon may attack.",
      });
      for (const input of record.inputs.slice(216)) {
        if (input.kind !== "intent") {
          throw new Error(`Expected a recorded intent, received ${input.kind}`);
        }
        expect(await run.applyIntent(input.seat, input.intent)).toEqual({ ok: true });
      }
      const activations = events.filter(
        (event) =>
          event.kind === "effectTriggered" &&
          event.sourceInstanceId === "s1-33" &&
          event.effectKey.startsWith("AD1-008/"),
      );
      expect(activations).toMatchObject([
        { effectKey: "AD1-008/ir-shared-0", printedTiming: "WhenDigivolving" },
        { effectKey: "AD1-008/ir-7-0", printedTiming: "WhenDigivolving" },
      ]);
      const replacement = events.find(
        (event) => event.kind === "cardPlayed" && event.instanceId === "s0-15" && event.permanentId === "perm-28",
      );
      expect(replacement).toMatchObject({ cardId: "ST20-05", fromZone: "trash" });
      expect(activations[0]!.seq).toBeLessThan(replacement!.seq);
      expect(replacement!.seq).toBeLessThan(activations[1]!.seq);
      expect(events).toContainEqual(
        expect.objectContaining({
          kind: "cardsMoved",
          deletedPermanents: [expect.objectContaining({ permanentId: "perm-28", cardId: "ST20-05" })],
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "attackDeclared", attackerPermanentId: "perm-24" }),
      );
      expect(run.state.pendingDecision).toBeUndefined();
    } finally {
      await run.applyIntent(0, { type: "surrender" });
    }
  });
});
