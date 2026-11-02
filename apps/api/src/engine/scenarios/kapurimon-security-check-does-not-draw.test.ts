import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./kapurimon-security-check-does-not-draw.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

const attackInput = 30;

describe("Kapurimon inherited draw on a security check", () => {
  it("replays the recorded match up to the attack", async () => {
    const { divergences } = await runReplay(record, { untilInput: attackInput });

    expect(divergences).toEqual([]);
  });

  it("does not draw when the attacking Digimon checks a face-down security card", async () => {
    const before = await runReplay(record, { untilInput: attackInput });
    const attackerSeat = before.state.players[1]!;
    const handBefore = attackerSeat.hand.length;
    const deckBefore = attackerSeat.deck.length;
    const defenderSecurityBefore = before.state.players[0]!.security.length;

    const after = await runReplay(record, { untilInput: attackInput + 1 });

    expect(after.state.players[0]!.security).toHaveLength(defenderSecurityBefore - 1);
    expect(after.state.players[0]!.security.every((card) => card.faceUp !== true)).toBe(true);
    expect(after.state.players[1]!.hand).toHaveLength(handBefore);
    expect(after.state.players[1]!.deck).toHaveLength(deckBefore);
  });
});
