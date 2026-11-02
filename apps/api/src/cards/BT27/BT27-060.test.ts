import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-060";
import "#api/cards/index";

type Setup = ReturnType<typeof setupEngine>;

const isProtected = (s: Setup, alias: string) =>
  observe(s.engine).hasKeyword(s.perm(alias), "Blocker") &&
  observe(s.engine).hasRestriction(s.perm(alias), "beReturned");

async function playThundermon(battleArea: { card: string; as: string }[], prefer?: string) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(
    { 0: { battleArea, hand: [{ card: "BT27-060", as: "thundermonX" }] } },
    { autoSelectCards: true, autoDeclineOptional: true, preferInstanceIds },
  );
  s.state.memory = 10;
  await s.ready();
  if (prefer !== undefined) preferInstanceIds.push(s.perm(prefer).topCard.instanceId);
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("thundermonX").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[0]!.battleArea.length === battleArea.length + 1 && !s.state.pendingDecision);
  return s;
}

describe("Thundermon (X Antibody) Mamemon protection", () => {
  it("matches the printed catalog entry and IR contract", () => {
    expect(getCardDefinition("BT27-060")).toMatchObject({
      nameEn: "Thundermon (X Antibody)",
      nameJp: "サンダーボールモンX抗体",
      colors: ["Black"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 5,
      dp: 5000,
      evoCosts: [
        { color: "Yellow", level: 3, memoryCost: 2 },
        { color: "Black", level: 3, memoryCost: 2 },
      ],
      forms: ["Champion"],
      attributes: ["Data"],
      types: ["Mutant", "X Antibody"],
      rarity: "C",
    });
    expect(compiled.effects.map(({ trigger, isInherited }) => [trigger, isInherited ?? false])).toEqual([
      ["OnPlay", false],
      ["WhenDigivolving", false],
      ["OnDeletion", false],
      ["Static", true],
    ]);
    expect(compiled.digivolutionRequirement).toEqual([{ namesExact: ["Thundermon"], cost: 0, isAlternate: true }]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("gives another Mamemon-named Digimon Blocker and return protection on play", async () => {
    const s = await playThundermon(
      [
        { card: "BT6-063", as: "bigMamemon" },
        { card: "BT1-010", as: "other" },
      ],
      "bigMamemon",
    );
    expect(isProtected(s, "bigMamemon")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("other"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasRestriction(s.perm("other"), "beReturned")).toBe(false);
  });

  it("can protect itself because its rule name includes Mamemon", async () => {
    const s = await playThundermon([{ card: "BT1-010", as: "other" }]);
    const thundermon = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "BT27-060")!;
    expect(observe(s.engine).hasRestriction(thundermon, "beReturned")).toBe(true);
    expect(observe(s.engine).hasRestriction(s.perm("other"), "beReturned")).toBe(false);
  });

  it("keeps the protection through the opponent's turn and drops it afterwards", async () => {
    const s = await playThundermon([{ card: "BT6-063", as: "bigMamemon" }], "bigMamemon");
    expect(isProtected(s, "bigMamemon")).toBe(true);
    s.state.memory = 0;
    s.state.turnSeat = 1;
    await advance(s.engine).runTurn(1);
    expect(observe(s.engine).hasKeyword(s.perm("bigMamemon"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasRestriction(s.perm("bigMamemon"), "beReturned")).toBe(false);
  });

  it.each([
    ["stops", true],
    ["without the protection does not stop", false],
  ])("%s an opponent's effect returning the Digimon to the hand", async (_label, protect) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            ...(protect ? [{ card: "BT27-060", as: "thundermonX" }] : []),
            { card: "BT6-063", as: "bigMamemon" },
          ],
        },
        1: { battleArea: [{ card: "BT1-027", as: "blue" }], hand: [{ card: "BT13-105", as: "bounce" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    if (protect) await advance(s.engine).verb.deletePermanent([s.perm("thundermonX").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("bounce").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () => s.state.players[1]!.trash.some(({ cardId }) => cardId === "BT13-105") && !s.state.pendingDecision,
    );
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(protect ? ["BT6-063"] : []);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(protect ? [] : ["BT6-063"]);
  });

  it("protects a remaining Mamemon-named Digimon when it is deleted", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-060", as: "thundermonX" },
            { card: "BT6-063", as: "bigMamemon" },
          ],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("thundermonX").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(isProtected(s, "bigMamemon")).toBe(true);
  });

  it("does nothing without a Mamemon-named Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-060", as: "thundermonX" },
            { card: "BT1-010", as: "other" },
          ],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("thundermonX").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(observe(s.engine).hasRestriction(s.perm("other"), "beReturned")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("other"), "Blocker")).toBe(false);
  });
});

describe("Thundermon (X Antibody) digivolution and inherited Blocker", () => {
  it.each([
    ["Thundermon through the alternate route", "BT8-061", true, 10],
    ["a Black level 3 through its printed cost", "BT2-052", false, 8],
  ])("digivolves from %s and protects a Mamemon", async (_label, base, useAlternateCost, memory) => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: base, as: "host" },
            { card: "BT6-063", as: "bigMamemon" },
          ],
          hand: [{ card: "BT27-060", as: "card" }],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true, preferInstanceIds },
    );
    await s.ready();
    s.state.memory = 10;
    preferInstanceIds.push(s.perm("bigMamemon").topCard.instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("card").instanceId,
        useAlternateCost,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT27-060" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(memory);
    expect(isProtected(s, "bigMamemon")).toBe(true);
  });

  it("rejects the cost 0 route from a non-Thundermon level 4", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT27-061", as: "host" }], hand: [{ card: "BT27-060", as: "card" }] },
    });
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("card").instanceId,
        useAlternateCost: true,
      }),
    ).not.toEqual({ ok: true });
  });

  it("gives the Digimon above it Blocker", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT6-063", under: ["BT27-060"], as: "host" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Blocker")).toBe(true);
  });
});
