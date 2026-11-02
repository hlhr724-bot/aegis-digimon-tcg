import { EffectTiming } from "@aegis/shared/schema/enums";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { effectiveStaticTraits } from "@aegis/shared/cards/effectiveTraits";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/BT27/BT27-007";
import "#api/cards/BT27/BT27-010";

describe("Solarmon Flame rule and start-of-main cost", () => {
  it.each([
    ["BT1-001", true],
    ["BT22-005", true],
    ["BT1-004", false],
  ] as const)("checks the printed zero-cost evolution from %s in breeding", async (base, valid) => {
    const s = setupEngine({
      0: {
        breeding: { card: base, as: "base" },
        hand: [{ card: "BT27-007", as: "rookie" }],
        deck: ["BT1-009", "BT1-010"],
      },
    });
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("rookie").instanceId,
      }).ok,
    ).toBe(valid);
    if (valid) {
      await settle(() => s.perm("base").topCard.cardId === "BT27-007" && !s.state.pendingDecision);
    }
    expect(s.perm("base").topCard.cardId).toBe(valid ? "BT27-007" : base);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(valid ? [base] : []);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(valid ? ["BT1-009"] : ["BT27-007"]);
    expect(s.state.memory).toBe(3);
    expect(s.state.turnSeat).toBe(0);
    assertNoLoudGap(s);
  });

  it("has both Machine and Flame traits through its printed rule", () => {
    expect(effectiveStaticTraits(requireCardDefinition("BT27-007"))).toEqual(
      expect.arrayContaining(["Machine", "Flame"]),
    );
  });

  it.each(["BT27-010", "BT27-007"])(
    "trashes the eligible hand card %s before drawing and gaining memory",
    async (card) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT27-007", as: "host" }],
            hand: [{ card, as: "cost" }, "BT1-009"],
            deck: [{ card: "BT1-010", as: "drawn" }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 0;
      await s.ready();
      await advance(s.engine).fireGlobal(EffectTiming.OnStartMainPhase);
      expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toContain(s.inst("cost").instanceId);
      expect(s.state.players[0]!.hand.map((c) => c.cardId)).toEqual(["BT1-009", "BT1-010"]);
      expect(s.state.memory).toBe(1);
      assertNoLoudGap(s);
    },
  );

  it.each([true, false])(
    "does not draw or gain memory when the cost is declined or unavailable: %s",
    async (eligible) => {
      const s = setupEngine(
        { 0: { battleArea: ["BT27-007"], hand: [eligible ? "BT27-010" : "BT1-009"], deck: ["BT1-010"] } },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.memory = 0;
      await s.ready();
      await advance(s.engine).fireGlobal(EffectTiming.OnStartMainPhase);
      expect(s.state.players[0]!.deck).toHaveLength(1);
      expect(s.state.players[0]!.trash).toHaveLength(0);
      expect(s.state.memory).toBe(0);
    },
  );

  it("does not activate at the opponent's main phase", async () => {
    const s = setupEngine(
      { 0: { battleArea: ["BT27-007"], hand: ["BT27-010"], deck: ["BT1-010"] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    await advance(s.engine).fireGlobal(EffectTiming.OnStartMainPhase);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(1);
  });
  it.each(["BT15-006", "EX13-004", "BT1-004"])("checks the Flame-only alternate evolution from %s", async (base) => {
    const valid = base !== "BT1-004";
    const s = setupEngine({
      0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-007", as: "evolution" }], deck: ["BT1-009"] },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
        useAlternateCost: true,
      }).ok,
    ).toBe(valid);
    if (valid) {
      await settle(() => s.perm("base").topCard.cardId === "BT27-007" && !s.state.pendingDecision);
    }
    expect(s.state.memory).toBe(5);
    expect(s.perm("base").topCard.cardId).toBe(valid ? "BT27-007" : base);
    assertNoLoudGap(s);
  });
});
