import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplay, type ReplayRecord } from "../../replays/inputs/index.js";
import { settle } from "../testkit/harness.js";

const fixture = new URL("./hand-warp-digivolve-offered.replay.json", import.meta.url);
const record = JSON.parse(readFileSync(fixture, "utf8")) as ReplayRecord;
const seat = 1;
const metalGarurumonId = "BT22-026";
const gabumonId = "BT22-017";
const effectKey = "BT22-026/ir-27-0";

describe("hand-warp-digivolve-offered", () => {
  it("offers the hand digivolution and warps Gabumon into MetalGarurumon for 6 memory", async () => {
    const replay = await runReplay(record, { untilInput: 56 });
    expect(replay.divergences).toEqual([]);
    const metalGarurumon = replay.state.players[seat]!.hand.find((card) => card.cardId === metalGarurumonId)!;
    const gabumon = replay.state.players[seat]!.battleArea.find(
      (permanent) => permanent.topCard?.cardId === gabumonId,
    )!;
    const memoryBefore = replay.state.memory;

    expect(JSON.parse(metalGarurumon.activatableEffectsJson)).toEqual([
      expect.objectContaining({ instanceId: metalGarurumon.instanceId, effectKey }),
    ]);
    expect([...metalGarurumon.digivolveTargetPermanentIds]).toEqual([]);

    expect(
      replay.engine.applyIntent(seat, {
        type: "activateEffect",
        sourceInstanceId: metalGarurumon.instanceId,
        effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => gabumon.topCard?.cardId === metalGarurumonId);

    expect(gabumon.stack.map((card) => card.cardId)).toContain(gabumonId);
    expect(replay.state.memory).toBe(memoryBefore - 6);
  });
});
