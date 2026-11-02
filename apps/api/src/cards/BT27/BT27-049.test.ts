import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { digivolutionRequirementsFor } from "@aegis/shared/effects/data";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-049";
import "#api/cards/index";

type AttackParams = {
  hand: string[];
  opponentBattleArea: string[];
  accept: boolean;
  preferOptionIndex?: number;
};

async function attackWithLiamon({ hand, opponentBattleArea, accept, preferOptionIndex }: AttackParams) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "BT27-049", as: "liamon" }],
        hand,
        deck: ["BT1-009", "BT1-009", "BT1-009"],
      },
      1: {
        battleArea: opponentBattleArea,
        security: ["BT1-009", "BT1-009", "BT1-009"],
        deck: ["BT1-009", "BT1-009"],
      },
    },
    {
      autoSelectCards: true,
      autoAcceptOptional: accept,
      autoDeclineOptional: !accept,
      autoChooseOption: true,
      ...(preferOptionIndex === undefined ? {} : { preferOptionIndex }),
    },
  );
  await s.ready();
  s.state.memory = 5;
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("liamon").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
  return s;
}

describe("Liamon alternate digivolution, discounted attack digivolution, and inherited Barrier", () => {
  it("publishes full IR with both printed alternate requirements", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { namesExact: ["Elecmon"], cost: 2, isAlternate: true },
      { level: 3, traits: ["Holy Beast", "ACCEL"], cost: 2, isAlternate: true },
    ]);
    expect(digivolutionRequirementsFor("BT27-049")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ namesExact: ["Elecmon"], cost: 2, isAlternate: true }),
        expect.objectContaining({ level: 3, traits: ["Holy Beast", "ACCEL"], cost: 2, isAlternate: true }),
      ]),
    );
  });

  it.each([
    ["BT1-028", "an off-color [Elecmon]", true],
    ["BT9-059", "an off-color level 3 [Holy Beast]", true],
    ["BT25-063", "an off-color level 3 [ACCEL]", true],
    ["BT1-009", "an off-color level 3 without the name or traits", false],
    ["BT25-067", "an off-color level 4 [ACCEL]", false],
  ])(
    "digivolves from %s (%s) for cost 2 only when the alternate requirement matches",
    async (base, _label, allowed) => {
      const s = setupEngine({
        0: {
          battleArea: [{ card: base, as: "base" }],
          hand: [{ card: "BT27-049", as: "liamon" }],
          deck: ["BT1-009"],
        },
      });
      await s.ready();
      s.state.memory = 5;
      const result = s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("liamon").instanceId,
      });
      expect(result.ok).toBe(allowed);
      if (allowed) {
        await settle(() => s.perm("base").topCard.cardId === "BT27-049" && !s.state.pendingDecision);
      }
      expect(s.perm("base").topCard.cardId).toBe(allowed ? "BT27-049" : base);
      expect(s.state.memory).toBe(allowed ? 3 : 5);
    },
  );

  it.each([
    [[], 3],
    [["BT1-009", "BT1-086"], 1],
    [["BT1-009", "BT1-009", "BT1-086"], 0],
    [["BT1-009", "BT1-009", "BT1-009", "BT1-086", "BT1-085"], 0],
  ])(
    "digivolves into a [Leomon]-named card while attacking with opponent's board %j paying %i",
    async (opponentBattleArea, paid) => {
      const s = await attackWithLiamon({ hand: ["BT13-043"], opponentBattleArea, accept: true });
      expect(s.perm("liamon").topCard.cardId).toBe("BT13-043");
      expect(s.perm("liamon").stack.map(({ cardId }) => cardId)).toEqual(["BT27-049"]);
      expect(s.state.memory).toBe(5 - paid);
    },
  );

  it("reduces an [ACCEL] card's chosen alternate cost by the opponent's Digimon count", async () => {
    const s = await attackWithLiamon({
      hand: ["BT20-041"],
      opponentBattleArea: ["BT1-009"],
      accept: true,
      preferOptionIndex: 1,
    });
    expect(s.perm("liamon").topCard.cardId).toBe("BT20-041");
    expect(s.state.memory).toBe(3);
  });

  it("does not digivolve into a card with neither [Leomon] in its name nor the [ACCEL] trait", async () => {
    const s = await attackWithLiamon({ hand: ["BT4-056"], opponentBattleArea: ["BT1-009"], accept: true });
    expect(s.perm("liamon").topCard.cardId).toBe("BT27-049");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT4-056"]);
    expect(s.state.memory).toBe(5);
  });

  it("keeps Liamon and the hand unchanged when the controller declines", async () => {
    const s = await attackWithLiamon({ hand: ["BT13-043"], opponentBattleArea: ["BT1-009"], accept: false });
    expect(s.perm("liamon").topCard.cardId).toBe("BT27-049");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT13-043"]);
    expect(s.state.memory).toBe(5);
  });

  it("grants Barrier only while Liamon is a digivolution card", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT4-056", as: "host", under: ["BT27-049"] },
          { card: "BT27-049", as: "top" },
        ],
      },
    });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Barrier")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("top"), "Barrier")).toBe(false);
  });

  it("is treated as having [Leomon] in its name by a name-gated inherited effect", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT27-049", as: "liamon", under: ["BT14-048"] },
          { card: "BT20-039", as: "control", under: ["BT14-048"] },
        ],
      },
    });
    await s.ready();
    s.state.turnSeat = 0;
    expect(s.perm("liamon").currentDP).toBe(getCardDefinition("BT27-049")!.dp + 2000);
    expect(s.perm("control").currentDP).toBe(getCardDefinition("BT20-039")!.dp);
  });
});
