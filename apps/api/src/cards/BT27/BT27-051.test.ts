import { describe, expect, it } from "vitest";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { effectiveStaticTraits } from "@aegis/shared/cards/effectiveTraits";
import { matchingAlternateDigivolutionRequirement } from "#api/engine/cards/cardData";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-051";
import "#api/cards/EX13/EX13-036";

type BattleParams = {
  opponentDp: number;
  accept: boolean;
};

async function playLoaderLeomon({ opponentDp, accept }: BattleParams) {
  const s = setupEngine(
    {
      0: { hand: [{ card: "BT27-051", as: "loader" }], deck: [{ card: "BT1-009", as: "recovered" }] },
      1: { battleArea: [{ card: "BT1-019", as: "opponent", dp: opponentDp }], security: ["BT1-009"] },
    },
    { autoAcceptOptional: accept, autoDeclineOptional: !accept, autoSelectCards: true },
  );
  s.state.memory = 7;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("loader").instanceId })).toEqual({ ok: true });
  await settle(() => hasFinishedBattleChoice(s, accept) && !s.state.pendingDecision);
  expect(s.state.memory).toBe(0);
  return s;
}

function hasFinishedBattleChoice(s: ReturnType<typeof setupEngine>, accept: boolean) {
  if (accept) {
    return (
      s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT27-051") &&
      !observe(s.engine).isAttacking()
    );
  }
  return s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT27-051");
}

function findLoaderLeomon(s: ReturnType<typeof setupEngine>) {
  return s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT27-051");
}

describe("LoaderLeomon optional battle, Fortitude, and deletion recovery", () => {
  it("encodes Fortitude, both battle windows, main and inherited recovery, and the alternate route", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 4, names: ["Leomon"], cost: 3, isAlternate: true },
      { level: 4, traits: ["Holy Beast", "ACCEL"], cost: 3, isAlternate: true },
    ]);
    expect(compiled.effects.find((effect) => effect.trigger === "Static")?.keywords).toEqual([
      { keyword: "Fortitude", raw: "＜Fortitude＞" },
    ]);
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      expect(compiled.effects.find((effect) => effect.trigger === trigger)?.actions).toMatchObject([
        { kind: "Battle", optional: true, attacker: { isSelf: true }, target: { filter: { controller: "opponent" } } },
      ]);
    }
    const deletion = compiled.effects.filter((effect) => effect.trigger === "OnDeletion");
    expect(deletion.map((effect) => effect.isInherited === true)).toEqual([false, true]);
    for (const effect of deletion) {
      expect(effect.actions).toMatchObject([
        { kind: "SecurityManipulation", op: "addTop", controller: "mine", source: "deck", amount: 1 },
      ]);
    }
  });

  it("has the Holy Beast trait through its rule, which satisfies a Holy Beast digivolution gate", () => {
    expect(requireCardDefinition("BT27-051").types).not.toContain("Holy Beast");
    expect(effectiveStaticTraits(requireCardDefinition("BT27-051"))).toContain("Holy Beast");
    expect(matchingAlternateDigivolutionRequirement("EX13-036", "BT27-051")).toMatchObject({ level: 5, cost: 3 });
    expect(matchingAlternateDigivolutionRequirement("EX13-036", "EX5-032")).toBeUndefined();
  });

  it.each([
    ["off-color Leomon", "BT1-035", true, true, 3],
    ["off-color Holy Beast", "EX2-015", true, true, 3],
    ["off-color ACCEL", "BT25-067", true, true, 3],
    ["green Lv.4 by its printed cost", "BT1-071", false, true, 4],
    ["red Lv.4 without the name or traits", "BT1-019", true, false, 0],
    ["Lv.5 with Leomon in its name", "BT11-014", true, false, 0],
    ["Lv.3 Holy Beast", "BT1-050", true, false, 0],
  ])("digivolves from a %s", async (_label, base, useAlternateCost, allowed, cost) => {
    const s = setupEngine({
      0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-051", as: "loader" }], deck: ["BT1-009"] },
    });
    s.state.memory = 5;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("loader").instanceId,
      useAlternateCost,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) {
      await settle(() => s.perm("base").topCard.cardId === "BT27-051" && !s.state.pendingDecision);
    }
    expect(s.state.memory).toBe(5 - cost);
    expect(s.perm("base").topCard.cardId).toBe(allowed ? "BT27-051" : base);
  });

  it("battles on play without attacking, deletes the lower-DP Digimon, and checks no security", async () => {
    const s = await playLoaderLeomon({ opponentDp: 6000, accept: true });
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(["BT1-019"]);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(findLoaderLeomon(s)?.isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(0);
  });

  it("leaves the opponent's Digimon alone when the on-play battle is declined", async () => {
    const s = await playLoaderLeomon({ opponentDp: 6000, accept: false });
    expect(s.perm("opponent").topCard.cardId).toBe("BT1-019");
    expect(findLoaderLeomon(s)).toBeDefined();
  });

  it("is deleted when it loses the on-play battle and recovers from the top of the deck", async () => {
    const s = await playLoaderLeomon({ opponentDp: 9000, accept: true });
    expect(findLoaderLeomon(s)).toBeUndefined();
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT27-051"]);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("recovered").instanceId]);
    expect(s.perm("opponent").topCard.cardId).toBe("BT1-019");
  });

  it("deletes both Digimon on a DP tie", async () => {
    const s = await playLoaderLeomon({ opponentDp: 7000, accept: true });
    expect(findLoaderLeomon(s)).toBeUndefined();
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("battles only the chosen opposing Digimon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT27-051", as: "loader" }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "spared" },
            { card: "BT1-013", as: "chosen" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("chosen").permanentId, s.perm("chosen").topCard.instanceId);
    s.state.memory = 7;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("loader").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
      s.perm("spared").permanentId,
    ]);
  });

  it.each([true, false])("may battle when digivolving from a Leomon (accept: %s)", async (accept) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-035", as: "base" }], hand: [{ card: "BT27-051", as: "loader" }] },
        1: { battleArea: [{ card: "BT1-019", as: "opponent" }], security: ["BT1-009"] },
      },
      { autoAcceptOptional: accept, autoDeclineOptional: !accept, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("loader").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard.cardId === "BT27-051" && hasFinishedBattleChoice(s, accept) && !s.state.pendingDecision,
    );
    expect(s.state.memory).toBe(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(accept ? 0 : 1);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
  });

  it("returns through Fortitude, recovers, and may battle again on play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-051", as: "loader", under: [{ card: "BT1-014", as: "source" }] }],
          deck: [{ card: "BT1-009", as: "recovered" }, "BT1-013"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("loader").permanentId]);
    await settle(() => findLoaderLeomon(s) !== undefined && s.state.players[1]!.battleArea.length === 0);
    expect(findLoaderLeomon(s)?.stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("source").instanceId]);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("recovered").instanceId]);
    expect(s.state.memory).toBe(2);
  });

  it("stays in the trash without digivolution cards but still recovers", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-051", as: "loader" }], deck: [{ card: "BT1-009", as: "recovered" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("loader").permanentId]);
    await settle(() => s.state.players[0]!.security.length === 1 && !s.state.pendingDecision);
    expect(findLoaderLeomon(s)).toBeUndefined();
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT27-051"]);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("recovered").instanceId]);
  });

  it("recovers from the inherited effect when its host is deleted", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-019", as: "host", under: ["BT27-051"] }],
          deck: [
            { card: "BT1-009", as: "recovered" },
            { card: "BT1-013", as: "kept" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
    await settle(() => s.state.players[0]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("recovered").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("kept").instanceId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("recovers once from the main effect and once from an inherited copy beneath it", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-051", as: "loader", under: ["BT27-051"] }],
          deck: ["BT1-009", "BT1-013", { card: "BT1-014", as: "kept" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("loader").permanentId]);
    await settle(
      () => s.state.players[0]!.security.length === 2 && findLoaderLeomon(s) !== undefined && !s.state.pendingDecision,
    );
    expect(s.state.players[0]!.security.map((card) => card.cardId).sort()).toEqual(["BT1-009", "BT1-013"]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("kept").instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT27-051"]);
  });
});
