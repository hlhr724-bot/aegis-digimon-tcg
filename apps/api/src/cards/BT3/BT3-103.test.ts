import { CardColor, EffectTiming, getCardDefinition, type Seat } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { syntheticDefinitions } from "../../engine/testkit/syntheticDefinitions.js";
import "./BT3-103.js";
import "#api/cards/AD1/AD1-011";
import "#api/cards/BT12/BT12-030";
import "#api/cards/BT12/BT12-050";
import "#api/cards/ST9/ST9-06";
import "./BT3-044.js";
import "./BT3-054.js";
import "./BT3-055.js";
import "./BT3-057.js";
import "../BT1/BT1-037.js";
import "../BT1/BT1-057.js";
import "../BT1/BT1-071.js";
import "../BT5/BT5-008.js";
import "../BT5/BT5-021.js";
import "../BT5/BT5-033.js";
import "../BT10/BT10-040.js";
import "../BT10/BT10-085.js";
import "../BT13/BT13-056.js";
import "../P/P-166.js";

describe("BT3-103 Hidden Potential Discovered!", () => {
  it("suspends a Digimon to reduce the next green digivolution cost by 5", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT3-054", as: "base" },
            { card: "BT3-044", as: "payer" },
          ],
          hand: [
            { card: "BT3-103", as: "option" },
            { card: "BT3-057", as: "evolving" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("payer").topCard.instanceId);
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT3-103"));
    const memoryAfterOption = s.state.memory;
    expect(s.perm("payer").isSuspended).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT3-057" && s.perm("payer").isSuspended);
    expect(s.state.memory).toBe(memoryAfterOption);
  });

  it("adds itself to its owner's hand from security", async () => {
    const s = setupEngine({ 0: { security: [{ card: "BT3-103", as: "securityOption", faceUp: true }] } });
    const id = s.inst("securityOption").instanceId;
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === id)).toBe(true);
  });
});

interface DigivolveScenario {
  baseCard: string;
  intoCard: string;
  restrictor?: { card: string; seat: Seat };
}

interface DigivolveOutcome {
  digivolved: boolean;
  memoryPaid: number;
  payerSuspended: boolean;
}

const useHiddenPotential = async (s: EngineSetup): Promise<void> => {
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT3-103"));
};

const digivolveAfterHiddenPotential = async (scenario: DigivolveScenario): Promise<DigivolveOutcome> => {
  const preferred: string[] = [];
  const restrictor = scenario.restrictor;
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: scenario.baseCard, as: "base" },
          { card: "BT3-044", as: "payer" },
          ...(restrictor?.seat === 0 ? [{ card: restrictor.card }] : []),
        ],
        hand: [
          { card: "BT3-103", as: "option" },
          { card: scenario.intoCard, as: "evolving" },
        ],
        security: 5,
      },
      1: {
        battleArea: restrictor?.seat === 1 ? [{ card: restrictor.card }] : [],
        security: 5,
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
  );
  preferred.push(s.perm("payer").topCard.instanceId);
  s.state.memory = 10;
  await useHiddenPotential(s);
  const memoryBefore = s.state.memory;
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("evolving").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("base").topCard.cardId === scenario.intoCard);
  return {
    digivolved: s.perm("base").topCard.cardId === scenario.intoCard,
    memoryPaid: memoryBefore - s.state.memory,
    payerSuspended: s.perm("payer").isSuspended,
  };
};

describe("BT3-103 Hidden Potential Discovered! — KB Q&A rulings", () => {
  it("lets the Digimon suspended to pay the reduction digivolve itself (Q1137)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT3-054", as: "base" }],
          hand: [
            { card: "BT3-103", as: "option" },
            { card: "BT3-057", as: "evolving" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await useHiddenPotential(s);
    const memoryBefore = s.state.memory;
    expect(s.perm("base").isSuspended).toBe(false);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT3-057" && s.perm("base").isSuspended);

    expect(s.perm("base").topCard.cardId).toBe("BT3-057");
    expect(s.perm("base").isSuspended).toBe(true);
    expect(memoryBefore - s.state.memory).toBe(0);
  });

  it("does not reduce the cost when a non-green Digimon digivolves into a green card (Q1138)", async () => {
    const fromBlue = await digivolveAfterHiddenPotential({ baseCard: "BT1-037", intoCard: "BT3-055" });
    expect(fromBlue).toEqual({ digivolved: true, memoryPaid: 3, payerSuspended: false });

    const fromGreen = await digivolveAfterHiddenPotential({ baseCard: "BT1-071", intoCard: "BT3-055" });
    expect(fromGreen).toEqual({ digivolved: true, memoryPaid: 0, payerSuspended: true });
  });

  it("reduces the cost when a green Digimon digivolves into a non-green card (Q1139)", async () => {
    const fromGreen = await digivolveAfterHiddenPotential({ baseCard: "BT3-054", intoCard: "BT10-040" });
    expect(fromGreen).toEqual({ digivolved: true, memoryPaid: 0, payerSuspended: true });

    const fromYellow = await digivolveAfterHiddenPotential({ baseCard: "BT1-057", intoCard: "BT10-040" });
    expect(fromYellow).toEqual({ digivolved: true, memoryPaid: 3, payerSuspended: false });
  });

  it("reduces the cost of a green Digimon digivolving through another card's effect (Q1140)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT3-054", as: "base" },
            { card: "BT3-044", as: "payer" },
          ],
          hand: [
            { card: "BT3-103", as: "option" },
            { card: "BT10-085", as: "sistermon" },
            { card: "BT13-056", as: "evolving" },
          ],
          security: 5,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("payer").topCard.instanceId);
    s.state.memory = 10;
    await useHiddenPotential(s);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("sistermon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("base").topCard.cardId === "BT13-056");

    const sistermonPlayCost = 4;
    const sistermonMemoryGain = 1;
    expect(s.perm("base").topCard.cardId).toBe("BT13-056");
    expect(s.perm("payer").isSuspended).toBe(true);
    expect(s.state.memory).toBe(10 - sistermonPlayCost + sistermonMemoryGain);
  });

  it("[Gaossmon]'s restriction makes the opponent pay the full digivolution cost (Q1285)", async () => {
    const restricted = await digivolveAfterHiddenPotential({
      baseCard: "BT3-054",
      intoCard: "BT3-057",
      restrictor: { card: "BT5-008", seat: 1 },
    });
    expect(restricted).toEqual({ digivolved: true, memoryPaid: 4, payerSuspended: false });

    const ownGaossmon = await digivolveAfterHiddenPotential({
      baseCard: "BT3-054",
      intoCard: "BT3-057",
      restrictor: { card: "BT5-008", seat: 0 },
    });
    expect(ownGaossmon).toEqual({ digivolved: true, memoryPaid: 0, payerSuspended: true });
  });

  it("[Syakomon]'s restriction makes the opponent pay the full digivolution cost (Q1302)", async () => {
    const restricted = await digivolveAfterHiddenPotential({
      baseCard: "BT3-054",
      intoCard: "BT3-057",
      restrictor: { card: "BT5-021", seat: 1 },
    });
    expect(restricted).toEqual({ digivolved: true, memoryPaid: 4, payerSuspended: false });

    const ownSyakomon = await digivolveAfterHiddenPotential({
      baseCard: "BT3-054",
      intoCard: "BT3-057",
      restrictor: { card: "BT5-021", seat: 0 },
    });
    expect(ownSyakomon).toEqual({ digivolved: true, memoryPaid: 0, payerSuspended: true });
  });

  it("[Cutemon]'s restriction makes the opponent pay the full digivolution cost (Q1313)", async () => {
    const restricted = await digivolveAfterHiddenPotential({
      baseCard: "BT3-054",
      intoCard: "BT3-057",
      restrictor: { card: "BT5-033", seat: 1 },
    });
    expect(restricted).toEqual({ digivolved: true, memoryPaid: 4, payerSuspended: false });

    const ownCutemon = await digivolveAfterHiddenPotential({
      baseCard: "BT3-054",
      intoCard: "BT3-057",
      restrictor: { card: "BT5-033", seat: 0 },
    });
    expect(ownCutemon).toEqual({ digivolved: true, memoryPaid: 0, payerSuspended: true });
  });

  it("[Galemon] counts the Digimon suspended for this card, reducing its digivolution by 2 for a total of 7 (Q4276)", async () => {
    // No printed Bird/Avian card costs more than 4 to digivolve from level 4, so a total reduction of 7 would be invisible.
    const expensiveAvian = "TEST-BT3-103-EXPENSIVE-AVIAN";
    syntheticDefinitions.set(expensiveAvian, {
      ...getCardDefinition("BT5-053")!,
      cardId: expensiveAvian,
      nameEn: "Synthetic Expensive Avian",
      effectText: undefined,
      evoCosts: [{ color: CardColor.Green, level: 4, memoryCost: 9 }],
    });
    try {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT3-044", as: "payer" }],
            hand: [
              { card: "BT3-103", as: "option" },
              { card: "P-166", as: "galemon" },
              { card: expensiveAvian, as: "avian" },
            ],
            security: 5,
          },
          1: { battleArea: [{ card: "BT1-009", as: "target" }], security: 5 },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
      );
      preferred.push(s.perm("target").topCard.instanceId);
      s.state.memory = 10;
      await useHiddenPotential(s);
      const memoryBefore = s.state.memory;

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("galemon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.perm("galemon").topCard.cardId === expensiveAvian);

      const galemonPlayCost = 4;
      const reducedDigivolutionCost = 9 - 5 - 2;
      expect(s.perm("galemon").topCard.cardId).toBe(expensiveAvian);
      expect(s.perm("target").isSuspended).toBe(true);
      expect(s.perm("payer").isSuspended).toBe(true);
      expect(memoryBefore - s.state.memory).toBe(galemonPlayCost + reducedDigivolutionCost);
    } finally {
      syntheticDefinitions.delete(expensiveAvian);
    }
  });
});

describe("Hidden Potential battle-area suspension cost", () => {
  it.each([false, true])(
    "requires an unsuspended battle-area payer even with an active breeding Digimon (payer available: %s)",
    async (payerAvailable) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "AD1-011", as: "base", suspended: true },
              { card: "ST9-06", as: "payer", suspended: !payerAvailable },
            ],
            breeding: { card: "BT12-050", as: "breeding" },
            hand: [
              { card: "BT3-103", as: "option" },
              { card: "BT12-030", as: "evolving" },
            ],
            deck: ["BT1-009", "BT1-010"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      await s.ready();
      await useHiddenPotential(s);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("evolving").instanceId,
          useAlternateCost: true,
          alternateRequirementIndex: 0,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === "BT12-030" && !s.state.pendingDecision);
      expect(s.state.memory).toBe(payerAvailable ? 10 : 7);
      expect(s.perm("breeding").isSuspended).toBe(false);
      expect(s.perm("payer").isSuspended).toBe(true);
    },
  );
});
