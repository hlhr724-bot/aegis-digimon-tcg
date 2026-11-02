import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX5-034.js";
import "../index.js";

describe("EX5-034 BanchoLeomon", () => {
  it("matches the catalog and reduces play cost by five at six combined security", () => {
    expect(getCardDefinition("EX5-034")).toMatchObject({
      cardId: "EX5-034",
      nameEn: "BanchoLeomon",
      colors: ["Yellow", "Green"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      evoCosts: [
        { color: "Yellow", level: 5, memoryCost: 4 },
        { color: "Green", level: 5, memoryCost: 4 },
      ],
      types: ["Beastkin", "Boss"],
      effectText: expect.stringContaining("reduce the play cost by 5"),
    });
    expect(getCardDefinition("EX5-034")?.effectText).toContain("Suspend 1 of your opponent's Digimon");
    expect(getCardDefinition("EX5-034")?.effectText).toContain("get -4000 DP and gain");
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects?.find((entry) => entry.trigger === "BeforePayCost")?.actions?.[0]).toMatchObject({
      kind: "ReducePlayCost",
      payment: {
        kind: "automatic",
        condition: { kind: "totalSecurityCount", op: "lte", value: 6 },
      },
      amount: { kind: "fixed", value: 5 },
    });
  });
  it("suspends on play/digivolving and applies the bound -4000/Security Attack -1 package", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "OnPlay")?.actions?.[0]).toMatchObject({
      kind: "Suspend",
      target: { filter: { controller: "opponent" } },
    });
    expect(compiled.effects?.find((entry) => entry.trigger === "WhenDigivolving")?.actions?.[0]).toMatchObject({
      kind: "Suspend",
    });
    expect(compiled.effects?.find((entry) => entry.trigger === "AllTurns")).toMatchObject({
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { kind: ["Digimon"] },
          actions: [
            { kind: "SelectBind", optional: true, target: { bindAs: "ex5034OptionalTarget" } },
            { kind: "ModifyDP", amount: -4000, target: { fromSelectionRef: "ex5034OptionalTarget" } },
            {
              kind: "GainKeyword",
              keyword: { keyword: "SecurityAttack", amount: -1 },
              target: { fromSelectionRef: "ex5034OptionalTarget" },
            },
          ],
        },
      ],
    });
  });

  it("plays for seven memory at six combined security and suspends an opposing Digimon", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "EX5-034", as: "bancho" }], security: ["BT1-009", "BT1-009", "BT1-009"] },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 9000 }], security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bancho").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").isSuspended);

    expect(s.state.memory).toBe(0);
    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.perm("target").currentDP).toBe(5000);
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(-1);
  });

  it("does not receive the play-cost reduction above six combined security cards", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "EX5-034", as: "bancho" }], security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"] },
        1: { security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bancho").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "EX5-034"));
    expect(s.state.memory).toBe(-5);
  });

  it("publicly declines the optional package without changing the target", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "EX5-034", as: "bancho" }], security: ["BT1-009", "BT1-009", "BT1-009"] },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 9000 }], security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bancho").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.perm("target").currentDP).toBe(9000);
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(0);
  });

  it("suspends an opponent and applies the same package on public digivolution", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX5-032", as: "base" }], hand: [{ card: "EX5-034", as: "bancho" }] },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 9000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("bancho").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").isSuspended);

    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.perm("target").currentDP).toBe(5000);
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(-1);
  });
});

it.each([false, true])(
  "EX5-034 preserves its optional activation after declining an earlier suspension (after accepting=%s)",
  async (declineAfterAccept) => {
    const options = { autoAcceptOptional: false, autoSelectCards: !declineAfterAccept };
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX5-034", as: "bancho" },
            { card: "BT1-009", as: "first" },
            { card: "BT1-009", as: "second" },
            { card: "BT1-009", as: "third" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-010", as: "target", dp: 9000, suspended: true },
            { card: "BT1-010", as: "other", dp: 9000, suspended: true },
          ],
        },
      },
      options,
    );
    s.state.memory = 10;
    await s.ready();
    const firstId = s.perm("first").permanentId;
    const secondId = s.perm("second").permanentId;
    const thirdId = s.perm("third").permanentId;
    const attack = (as: string) =>
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm(as).permanentId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      });
    expect(attack("first")).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const first = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: first.decisionId,
        response: { kind: "optional", accept: declineAfterAccept },
      }),
    ).toEqual({ ok: true });
    let refusal: ReturnType<typeof s.engine.applyIntent> = { ok: true };
    if (declineAfterAccept) {
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      refusal = s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: [] },
      });
      options.autoSelectCards = true;
    }
    expect(refusal).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some((p) => p.permanentId === firstId));
    expect(s.perm("target").currentDP).toBe(9000);
    expect(attack("second")).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const second = s.state.pendingDecision!;
    expect(second.decisionId).not.toBe(first.decisionId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: second.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 5000);
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(-1);
    await settle(() => !s.state.players[0]!.battleArea.some((p) => p.permanentId === secondId));
    expect(attack("third")).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some((p) => p.permanentId === thirdId));
    expect(s.decisions.filter(({ req }) => req.kind === "optional")).toHaveLength(2);
  },
);

describe("EX5-034 BanchoLeomon — KB Q&A rulings", () => {
  it.each([
    { own: 1, opponent: 5, memoryAfterPlay: 0 },
    { own: 5, opponent: 2, memoryAfterPlay: -5 },
  ])(
    "adds both players' security stacks for the play cost reduction ($own + $opponent) (Q3600)",
    async ({ own, opponent, memoryAfterPlay }) => {
      const s = setupEngine(
        {
          0: { hand: [{ card: "EX5-034", as: "bancho" }], security: Array.from({ length: own }, () => "BT1-009") },
          1: { security: Array.from({ length: opponent }, () => "BT1-009") },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 7;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bancho").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX5-034"));

      expect(s.state.memory).toBe(memoryAfterPlay);
    },
  );
});
