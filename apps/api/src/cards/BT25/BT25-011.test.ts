import { EffectTiming, digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled as BT25_011 } from "./BT25-011.js";
import "../index.js";

describe("BT25-011 Aquilamon", () => {
  it("suspends one opponent Digimon, then conditionally offers Silphymon DNA", () => {
    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      const effect = BT25_011.effects?.find((entry) => entry.trigger === trigger);
      expect(effect?.actions?.[0]).toMatchObject({
        kind: "Suspend",
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
      });
      expect(effect?.actions?.[1]).toMatchObject({
        kind: "DnaDigivolve",
        optional: true,
        payCost: true,
        condition: { kind: "isYourTurn" },
        materials: { filter: { controller: "mine", kind: ["Digimon"] }, count: 2 },
        into: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Silphymon"], match: "nameExact" }] },
      });
    }
  });

  it("preserves Raid and inherited +2000 DP", () => {
    expect(BT25_011.effects?.some((entry) => entry.keywords?.[0]?.keyword === "Raid")).toBe(true);
    expect(BT25_011.effects?.find((entry) => entry.isInherited)).toMatchObject({
      actions: [{ kind: "ModifyDP", amount: 2000, duration: "permanent" }],
    });
  });

  it("suspends an opponent and DNA-digivolves from a real play origin", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-034", as: "yellowMaterial" }],
          hand: [
            { card: "BT25-011", as: "aquilamon" },
            { card: "BT16-012", as: "silphymon" },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 12000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("aquilamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT16-012"));

    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.battleArea[0]!.topCard?.cardId).toBe("BT16-012");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(s.inst("silphymon").instanceId);
  });

  it("suspends on the opponent turn but does not offer the conditional DNA effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-011", as: "aquilamon" },
            { card: "BT24-034", as: "partner" },
          ],
          hand: [{ card: "BT16-012", as: "silphymon" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("aquilamon"));

    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT16-012"]);
  });

  it("does not DNA-digivolve when there is only one own material", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-011", as: "aquilamon" }],
          hand: [{ card: "BT16-012", as: "silphymon" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("aquilamon"));

    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea.map((perm) => perm.topCard.cardId)).toEqual(["BT25-011"]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT16-012"]);
  });

  it("reaches Aquilamon through a legal Hawkmon stack, then resolves DNA into Silphymon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-010", as: "hawkmon" },
            { card: "BT24-034", as: "partner" },
          ],
          hand: [
            { card: "BT25-011", as: "aquilamon" },
            { card: "BT16-012", as: "silphymon" },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("hawkmon").permanentId,
        instanceId: s.inst("aquilamon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("target").isSuspended &&
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT16-012"),
    );

    const merged = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT16-012")!;
    expect(merged.stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT25-010", "BT25-011", "BT24-034"]),
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(merged.currentDP).toBe(12000);
    s.state.turnSeat = 1;
    await s.engine.recomputeContinuousEffects();
    expect(merged.currentDP).toBe(8000);
  });

  it("declines the optional DNA evolution despite two legal materials", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-011", as: "aquilamon" },
            { card: "BT24-034", as: "partner" },
          ],
          hand: [{ card: "BT16-012", as: "silphymon" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target" }] },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    await s.ready();

    const firing = advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("aquilamon"));
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await firing;

    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea.map((perm) => perm.topCard.cardId)).toEqual(["BT25-011", "BT24-034"]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT16-012"]);
  });

  it("uses the printed Raid keyword on a public player-directed attack", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-011", as: "aquilamon", dp: 4000 }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "raidTarget", dp: 3000 },
            { card: "BT1-010", as: "untouched", dp: 1000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const raidTargetId = s.perm("raidTarget").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("aquilamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === raidTargetId));

    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["BT1-010"]);
  });

  it("keeps the printed catalog identity and alternate evolution route", () => {
    expect(getCardDefinition("BT25-011")).toMatchObject({
      colors: ["Red", "Green"],
      level: 4,
      playCost: 4,
      dp: 4000,
      types: ["Giant Bird", "Iliad", "TS"],
    });
    expect(digivolutionRequirementsFor("BT25-011")).toEqual([
      { names: ["Hawkmon"], cost: 2, isAlternate: true },
      { level: 3, traits: ["TS"], cost: 2, isAlternate: true },
    ]);
  });
});
