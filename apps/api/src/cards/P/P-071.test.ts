import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./P-071.js";

describe("P-071 Impmon", () => {
  it("plays a purple level 3 from trash for free and applies the errata that adds itself to hand", async () => {
    const s = setupEngine(
      {
        0: {
          trash: [{ card: "BT2-069", as: "gabumon" }],
          security: [{ card: "P-071", as: "impmon" }],
        },
        1: { battleArea: [{ card: "BT1-025", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const gabumonId = s.inst("gabumon").instanceId;
    const impmonId = s.inst("impmon").instanceId;
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === gabumonId) &&
        s.state.players[0]!.hand.some((card) => card.instanceId === impmonId),
    );

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === gabumonId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === impmonId)).toBe(true);
  });

  it("battles as a security Digimon first, then plays from trash and returns to hand at the end of the battle", async () => {
    const s = setupEngine(
      {
        0: {
          trash: [{ card: "BT2-069", as: "gabumon" }],
          security: [{ card: "P-071", as: "impmon" }],
        },
        1: { battleArea: [{ card: "BT1-025", as: "attacker", dp: 1000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const impmonId = s.inst("impmon").instanceId;
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.hand.some((card) => card.instanceId === impmonId) && s.state.pendingDecision === undefined,
    );

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("gabumon").instanceId),
    ).toBe(true);
  });

  it("may decline the purple level 3 play and still adds itself to hand", async () => {
    const s = setupEngine(
      {
        0: {
          trash: [{ card: "BT2-069", as: "gabumon" }],
          security: [{ card: "P-071", as: "impmon" }],
        },
        1: { battleArea: [{ card: "BT1-025", as: "attacker" }] },
      },
      { autoDeclineOptional: true },
    );
    const gabumonId = s.inst("gabumon").instanceId;
    const impmonId = s.inst("impmon").instanceId;
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === impmonId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === gabumonId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === impmonId)).toBe(true);
  });
});
