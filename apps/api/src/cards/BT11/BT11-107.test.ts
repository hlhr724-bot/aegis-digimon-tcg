import { describe, expect, it } from "vitest";
import { getCardDefinition, type DecisionRequest, type DecisionResponse } from "@aegis/shared";
import { drainMicrotasks, setupEngine, settle, type PermanentSpec } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { compiled } from "./BT11-107.js";
import { X_ANTIBODY_NAME_PROBES, xAntibodyNameGateVerdicts } from "../../engine/testkit/xAntibodyNameGate.js";
import "../BT1/BT1-021.js";
import "../BT7/BT7-095.js";

describe("BT11-107 Hades Force", () => {
  it("maps catalog facts and each printed effect to IR", () => {
    expect(getCardDefinition("BT11-107")).toMatchObject({
      cardId: "BT11-107",
      colors: ["Black", "Red"],
      kinds: ["Option"],
      playCost: 7,
    });
    expect(compiled.effects).toMatchObject([
      {
        trigger: "Static",
        actions: [
          {
            kind: "Replacement",
            event: "wouldBePlayed",
            actions: [{ condition: { filter: { digivolutionStackNameOrTrait: [{ tokens: ["X Antibody"] }] } } }],
          },
        ],
      },
      { trigger: "Main", actions: [{ kind: "SelectBind" }, { kind: "Delete" }, { kind: "Attack" }] },
      { trigger: "Security", isSecurity: true, actions: [{ kind: "Delete" }] },
    ]);
  });

  it("deletes opponent Digimon and Tamers within the selected Greymon's play-cost budget", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-064", under: ["BT9-109"], as: "greymon" }],
          hand: [{ card: "BT11-107", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "ST1-02", as: "digimon" },
            { card: "BT1-088", as: "tamer" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    expect(s.perm("greymon").stack).toHaveLength(1);
    expect(s.perm("greymon").stack[0]!.cardId).toBe("BT9-109");
    expect(getCardDefinition("BT11-107")!.playCost).toBe(7);
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0, 400);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.memory).toBe(5);
  });

  it("Discord 1556322403456520223: asks for the whole budgeted target set before deleting anything", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-064", under: ["BT9-109"], as: "greymon" }],
          hand: [{ card: "BT11-107", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "ST1-02", as: "cheap" },
            { card: "BT1-088", as: "tamer" },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks(400);
    const picks = s.decisions.filter(
      ({ req }) => req.kind === "chooseTargets" && req.options?.maxTotalPlayCost !== undefined,
    );
    expect(picks).toHaveLength(1);
    const { seat, req } = picks[0]!;
    expect(req.options).toMatchObject({ min: 0, max: 2, maxTotalPlayCost: 5, targetFate: "delete" });
    expect(req.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.perm("cheap").permanentId, s.perm("tamer").permanentId]),
    );
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(
      s.engine.applyIntent(seat, {
        type: "respondDecision",
        decisionId: req.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("tamer").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some((card) => card.cardId === "BT1-088"));
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["ST1-02"]);
  });

  it("registers the complete IR", () => {
    const runtimeCard = runtimeCompiledCard("BT11-107")!;
    expect(runtimeCard.coverage).toBe("full");
    expect(runtimeCard.residual).toHaveLength(0);
    expect(runtimeCard.effects?.find((effect) => effect.trigger === "Main")?.actions[0]).toMatchObject({
      kind: "SelectBind",
    });
    expect(runtimeCard.effects?.find((effect) => effect.trigger === "Security")).toMatchObject({ isSecurity: true });
  });
});

describe("BT11-107 [X Antibody] reference", () => {
  it("matches the X Antibody card name and its Rule aliases, not X Antibody-trait Digimon", () => {
    expect(xAntibodyNameGateVerdicts("BT11-107")).toEqual(X_ANTIBODY_NAME_PROBES);
  });
});

describe("BT11-107 Hades Force — KB Q&A rulings", () => {
  type Setup = ReturnType<typeof setupEngine>;
  type Answer = (req: DecisionRequest) => DecisionResponse;

  const NENE_AMANO_BLACK_TAMER = "BT10-092";
  const METALGREYMON_WHEN_ATTACKING_GAIN_3 = "BT1-021";

  const acceptEverything: Answer = (req) => {
    if (req.kind === "optional") {
      return { kind: "optional", accept: true };
    }
    const count = req.options?.selectionContext === "attackTarget" ? 1 : (req.options?.min ?? 0);
    return {
      kind: req.kind === "chooseTargets" ? "chooseTargets" : "selectCards",
      instanceIds: (req.options?.candidateInstanceIds ?? []).slice(0, count),
    };
  };

  const isBudgetDeletionPrompt = (req: DecisionRequest) =>
    req.kind === "chooseTargets" && req.options?.maxTotalPlayCost !== undefined;

  const keepOpponentBoard: Answer = (req) =>
    isBudgetDeletionPrompt(req) ? { kind: "chooseTargets", instanceIds: [] } : acceptEverything(req);

  async function answerAll(s: Setup, answer: Answer): Promise<void> {
    let handled = 0;
    for (let round = 0; round < 40; round += 1) {
      await drainMicrotasks(200);
      if (s.decisions.length === handled) return;
      while (handled < s.decisions.length) {
        const { seat, req } = s.decisions[handled++]!;
        if (req.kind === "orderTriggers" || req.kind === "orderCards") continue;
        s.engine.applyIntent(seat, { type: "respondDecision", decisionId: req.decisionId, response: answer(req) });
      }
    }
  }

  async function useHadesForce(s: Setup, answer: Answer): Promise<void> {
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("hadesForce").instanceId })).toEqual({
      ok: true,
    });
    await answerAll(s, answer);
  }

  const onBoard = (s: Setup, seat: 0 | 1, alias: string) =>
    s.state.players[seat]!.battleArea.some(({ permanentId }) => permanentId === s.perm(alias).permanentId);

  const attackTargetRequests = (s: Setup) =>
    s.decisions.filter(({ req }) => req.promptText === "Choose the attack target for the forced attack.");

  function greymonBoard(greymon: PermanentSpec) {
    return setupEngine({
      0: {
        battleArea: [greymon, NENE_AMANO_BLACK_TAMER],
        hand: [{ card: "BT11-107", as: "hadesForce" }],
        security: 3,
      },
      1: { security: 3 },
    });
  }

  it("may choose Digimon whose combined play cost is lower than the Greymon's play cost on purpose (Q2134)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: METALGREYMON_WHEN_ATTACKING_GAIN_3, as: "greymon" }, NENE_AMANO_BLACK_TAMER],
        hand: [{ card: "BT11-107", as: "hadesForce" }],
      },
      1: {
        battleArea: [
          { card: "ST1-02", as: "chosen" },
          { card: "BT1-009", as: "spared" },
        ],
      },
    });
    const sparedPermanentId = s.perm("spared").permanentId;
    const budgetPrompts: DecisionRequest[] = [];

    await useHadesForce(s, (req) => {
      if (isBudgetDeletionPrompt(req)) {
        budgetPrompts.push(req);
        return { kind: "chooseTargets", instanceIds: [s.perm("chosen").permanentId] };
      }
      return req.kind === "optional" ? { kind: "optional", accept: false } : acceptEverything(req);
    });

    expect(budgetPrompts).toHaveLength(1);
    expect(budgetPrompts[0]!.options?.candidateInstanceIds).toContain(sparedPermanentId);
    expect(onBoard(s, 1, "spared")).toBe(true);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-009"]);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(["ST1-02"]);
  });

  it("cannot make a suspended or newly played Greymon attack (Q2135)", async () => {
    for (const greymon of [
      { card: METALGREYMON_WHEN_ATTACKING_GAIN_3, as: "greymon", suspended: true },
      { card: METALGREYMON_WHEN_ATTACKING_GAIN_3, as: "greymon", enteredThisTurn: true },
    ]) {
      const s = greymonBoard(greymon);
      await useHadesForce(s, acceptEverything);
      expect(attackTargetRequests(s)).toHaveLength(0);
      expect(s.state.players[1]!.security).toHaveLength(3);
    }

    const ready = greymonBoard({ card: METALGREYMON_WHEN_ATTACKING_GAIN_3, as: "greymon" });
    await useHadesForce(ready, acceptEverything);
    expect(attackTargetRequests(ready)).toHaveLength(1);
    expect(ready.state.players[1]!.security).toHaveLength(2);
  });

  it("activates the Greymon's [When Attacking] effect when it attacks with this effect (Q2136)", async () => {
    const attacked = greymonBoard({ card: METALGREYMON_WHEN_ATTACKING_GAIN_3, as: "greymon" });
    await useHadesForce(attacked, acceptEverything);
    expect(attacked.perm("greymon").isSuspended).toBe(true);
    expect(attacked.state.players[1]!.security).toHaveLength(2);
    expect(attacked.state.memory).toBe(10 - 7 + 3);

    const declined = greymonBoard({ card: METALGREYMON_WHEN_ATTACKING_GAIN_3, as: "greymon" });
    await useHadesForce(declined, (req) =>
      req.kind === "optional" ? { kind: "optional", accept: false } : acceptEverything(req),
    );
    expect(declined.perm("greymon").isSuspended).toBe(false);
    expect(declined.state.memory).toBe(10 - 7);
  });

  it("only lets a Greymon that can also attack unsuspended Digimon attack the player (Q2137)", async () => {
    const options = { autoSelectCards: true };
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: METALGREYMON_WHEN_ATTACKING_GAIN_3, as: "greymon" }, NENE_AMANO_BLACK_TAMER, "BT1-086"],
          hand: [
            { card: "BT7-095", as: "blueHawaiiDeath" },
            { card: "BT11-107", as: "hadesForce" },
          ],
          security: 3,
        },
        1: { battleArea: [{ card: "BT1-010", as: "unsuspendedTarget", dp: 20000 }], security: 3 },
      },
      options,
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blueHawaiiDeath").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).canAttackUnsuspended(s.perm("greymon")));

    options.autoSelectCards = false;
    await useHadesForce(s, keepOpponentBoard);

    const targetRequests = attackTargetRequests(s);
    expect(targetRequests).toHaveLength(1);
    expect(targetRequests[0]!.req.options?.candidateInstanceIds).toEqual(["player"]);
    expect(onBoard(s, 1, "unsuspendedTarget")).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });
});
