import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Barrier effect deletion", () => {
  it("deletes Bootmon by an Option effect without offering Barrier or paying security", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-056", as: "bootmon", suspended: true }], security: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-009" }], hand: [{ card: "ST1-16", as: "gaiaForce" }] },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 8;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT25-056"]);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.events.some((event) => event.kind === "barrierPrompt")).toBe(false);
  });
});
