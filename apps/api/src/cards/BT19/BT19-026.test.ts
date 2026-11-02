import { describe, expect, it } from "vitest";
import { getCardDefinition, Phase, type DecisionRequest, type Seat } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT19-026.js";

const FILLER = ["BT1-009", "BT1-013", "BT1-014", "BT1-009", "BT1-013", "BT1-014", "BT1-009", "BT1-013"];
const SECURITY = ["BT1-009", "BT1-013", "BT1-014", "BT1-009", "BT1-013", "BT1-014"];

function optionalScript(answers: boolean[]): {
  prompts: string[];
  drive(s: ReturnType<typeof setupEngine>): void;
} {
  const prompts: string[] = [];
  const answered = new Set<string>();
  let next = 0;
  return {
    prompts,
    drive(s) {
      for (const { seat, req } of s.decisions as { seat: Seat; req: DecisionRequest }[]) {
        if (req.kind !== "optional" || answered.has(req.decisionId)) continue;
        answered.add(req.decisionId);
        prompts.push(req.promptText);
        const accept = answers[next] ?? false;
        next += 1;
        s.engine.applyIntent(seat, {
          type: "respondDecision",
          decisionId: req.decisionId,
          response: { kind: "optional", accept },
        });
      }
    },
  };
}

function opponentHand(s: ReturnType<typeof setupEngine>): string[] {
  return s.state.players[1]!.hand.map((card) => card.cardId);
}

describe("BT19-026 ZeigGreymon", () => {
  it("matches the catalog print: Blue/Black Lv.6 Cyborg/Blue Flare with both printed texts", () => {
    expect(getCardDefinition("BT19-026")).toMatchObject({
      cardId: "BT19-026",
      nameEn: "ZeigGreymon",
      colors: ["Blue", "Black"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 11,
      dp: 11000,
      types: ["Cyborg", "Blue Flare"],
      evoCosts: [
        { color: "Blue", level: 5, memoryCost: 3 },
        { color: "Black", level: 5, memoryCost: 3 },
      ],
    });
    const definition = getCardDefinition("BT19-026")!;
    const text = definition.effectText!.replaceAll(" ", " ");
    expect(text).toContain(
      "[On Play] [When Digivolving] ＜De-Digivolve2＞ 1 of your opponent's Digimon. Then, if your opponent has 2 or more Digimon, return 1 of your opponent's level 4 or lower Digimon to the hand.",
    );
    expect(text).toContain(
      "[On Deletion] You may play 1 [Blue Flare]/[Xros Heart] trait Digimon card with a play cost of 5 or less from under your Tamers without paying the cost. Then, ＜Save＞.",
    );
    expect(definition.inheritedEffectText).toBe("[All Turns] This Digimon gets +2000 DP.");
  });

  it("compiles the printed clauses onto the printed timings, with ＜Save＞ declared and optional", () => {
    expect(compiled.effects?.map((effect) => [effect.trigger, effect.isInherited === true])).toEqual([
      ["OnPlay", false],
      ["WhenDigivolving", false],
      ["OnDeletion", false],
      ["AllTurns", true],
    ]);
    for (const index of [0, 1]) {
      expect(compiled.effects?.[index]?.actions).toMatchObject([
        { kind: "DeDigivolve", amount: 2, trackOpponentDigimonCountAs: "postDeDigivolveOpponentDigimonCount" },
        {
          kind: "Return",
          to: "hand",
          target: { filter: { controller: "opponent", levelComparison: { op: "lte", value: 4 } } },
          condition: { kind: "namedCountAtLeast", countSource: "postDeDigivolveOpponentDigimonCount", count: 2 },
        },
      ]);
    }
    expect(compiled.effects?.[2]).toMatchObject({
      actions: [
        {
          kind: "PlayWithoutCost",
          payCost: false,
          optional: true,
          from: ["underTamers"],
          target: {
            filter: {
              zone: "underTamers",
              playCostLte: 5,
              nameOrTrait: [{ tokens: ["Blue Flare", "Xros Heart"], match: "trait" }],
            },
          },
        },
        { kind: "PlaceUnder", optional: true, underFilter: { kind: ["Tamer"], excludeToken: true } },
      ],
      keywords: [{ keyword: "Save" }],
    });
    expect(compiled.effects?.[3]?.actions).toMatchObject([{ kind: "ModifyDP", amount: 2000, duration: "permanent" }]);
  });

  it("digivolves from a Blue/Black Lv.5 for 3 memory with the bonus draw, and refuses Lv.4 sources", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT19-025", as: "base" },
            { card: "BT19-021", as: "blueLv4" },
            { card: "BT1-014", as: "redLv4" },
          ],
          hand: [{ card: "BT19-026", as: "zeig" }, "BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { security: [...SECURITY], deck: [...FILLER] },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 8;
    await s.ready();
    const baseInstanceId = s.perm("base").topCard!.instanceId;

    for (const alias of ["blueLv4", "redLv4"]) {
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm(alias).permanentId,
          instanceId: s.inst("zeig").instanceId,
        }),
      ).toEqual({ ok: false, reason: "invalid-evolution" });
    }
    expect(s.state.memory).toBe(8);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("zeig").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT19-026");

    expect(s.state.memory).toBe(5);
    expect(s.perm("base").stack.map((card) => card.instanceId)).toEqual([baseInstanceId]);
    expect(s.state.players[0]!.hand).toHaveLength(2);
    expect(s.state.players[0]!.deck).toHaveLength(FILLER.length - 1);
  });

  it("[On Play] de-digivolves by 2 and bounces a Lv.4 when the opponent still has 2 Digimon", async () => {
    const prefer: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT19-026", as: "zeig" }, "BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: {
          battleArea: [
            { card: "BT19-023", as: "stack", under: ["BT19-025", "BT19-019"] },
            { card: "BT19-020", as: "level4" },
          ],
          security: [...SECURITY],
          deck: [...FILLER],
        },
      },
      { autoSelectCards: true, autoChooseOption: true, preferInstanceIds: prefer },
    );
    s.state.memory = 15;
    await s.ready();
    prefer.push(s.perm("stack").topCard!.instanceId);
    const level4InstanceId = s.perm("level4").topCard!.instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("zeig").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.hand.length === 1);

    expect(s.state.players[1]!.trash.map((card) => card.cardId).sort()).toEqual(["BT19-019", "BT19-023"]);
    expect(s.perm("stack").topCard?.cardId).toBe("BT19-025");
    expect(opponentHand(s)).toEqual(["BT19-020"]);
    expect(s.state.players[1]!.hand[0]!.instanceId).toBe(level4InstanceId);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("[When Digivolving] runs the same clause off a real digivolve from BT19-025", async () => {
    const prefer: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-025", as: "base" }],
          hand: [{ card: "BT19-026", as: "zeig" }, "BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: {
          battleArea: [
            { card: "BT19-023", as: "stack", under: ["BT19-025", "BT19-019"] },
            { card: "BT19-020", as: "level4" },
          ],
          security: [...SECURITY],
          deck: [...FILLER],
        },
      },
      { autoSelectCards: true, autoChooseOption: true, preferInstanceIds: prefer },
    );
    s.state.memory = 8;
    await s.ready();
    prefer.push(s.perm("stack").topCard!.instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("zeig").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.hand.length === 1);

    expect(s.perm("stack").topCard?.cardId).toBe("BT19-025");
    expect(opponentHand(s)).toEqual(["BT19-020"]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("does not bounce when ＜De-Digivolve＞ exposes a Tamer, leaving only 1 opposing Digimon (Q3080)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT19-026", as: "zeig" }, "BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: {
          battleArea: [
            { card: "BT19-023", as: "stack", under: ["BT19-081"] },
            { card: "BT19-021", as: "level4" },
          ],
          security: [...SECURITY],
          deck: [...FILLER],
        },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 15;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("zeig").instanceId })).toEqual({ ok: true });
    await settle(() => s.perm("stack").topCard?.cardId === "BT19-081");

    expect(opponentHand(s)).toEqual([]);
    expect(s.perm("level4").topCard?.cardId).toBe("BT19-021");
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("counts a temporarily exposed Digi-Egg as the second Digimon before rule cleanup (Q3079)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT19-026", as: "zeig" }, "BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: {
          battleArea: [
            { card: "BT19-023", as: "stack", under: ["BT19-001"] },
            { card: "BT19-021", as: "level4" },
          ],
          security: [...SECURITY],
          deck: [...FILLER],
        },
      },
      { autoChooseOption: true },
    );
    s.state.memory = 15;
    await s.ready();
    const level4InstanceId = s.perm("level4").topCard!.instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("zeig").instanceId })).toEqual({ ok: true });
    for (const alias of ["stack", "level4"]) {
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      const pending = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm(alias).permanentId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.decisionId !== pending.decisionId);
    }
    await settle(() => s.state.players[1]!.hand.length === 1);

    expect(s.state.players[1]!.hand[0]!.instanceId).toBe(level4InstanceId);
    expect(opponentHand(s)).toEqual(["BT19-021"]);
    expect(s.state.players[1]!.trash.map((card) => card.cardId).sort()).toEqual(["BT19-001", "BT19-023"]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("[On Deletion] plays an eligible cost-5-or-less [Blue Flare]/[Xros Heart] card, then ＜Save＞s itself (Q3081)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT19-026", as: "zeig" },
            { card: "BT19-081", as: "tamer", under: ["BT19-021", "BT19-025", "BT19-016"] },
          ],
          hand: ["BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { security: [...SECURITY], deck: [...FILLER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const zeigInstanceId = s.perm("zeig").topCard!.instanceId;
    const ineligible = s
      .perm("tamer")
      .stack.filter((card) => card.cardId !== "BT19-016")
      .map((card) => card.instanceId);

    await advance(s.engine).verb.deletePermanent([s.perm("zeig").permanentId], "byEffect");
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT19-016"));

    expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([zeigInstanceId, ...ineligible]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard?.cardId).sort()).toEqual(["BT19-016", "BT19-081"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("[On Deletion] ＜Save＞ still resolves when the optional free play is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT19-026", as: "zeig" },
            { card: "BT19-081", as: "tamer", under: ["BT19-016"] },
          ],
          hand: ["BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { security: [...SECURITY], deck: [...FILLER] },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const zeigInstanceId = s.perm("zeig").topCard!.instanceId;
    const gaossmonId = s.perm("tamer").stack[0]!.instanceId;
    const script = optionalScript([false, true]);

    void advance(s.engine).verb.deletePermanent([s.perm("zeig").permanentId], "byEffect");
    await settle(() => {
      script.drive(s);
      return s.perm("tamer").stack.some((card) => card.instanceId === zeigInstanceId);
    });

    expect(script.prompts).toHaveLength(2);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT19-016")).toBe(false);
    expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([zeigInstanceId, gaossmonId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("[On Deletion] declining ＜Save＞ leaves ZeigGreymon in the trash (comprehensive 16-20-3)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT19-026", as: "zeig" },
            { card: "BT19-081", as: "tamer", under: ["BT19-016"] },
          ],
          hand: ["BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { security: [...SECURITY], deck: [...FILLER] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const zeigInstanceId = s.perm("zeig").topCard!.instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm("zeig").permanentId], "byEffect");
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === zeigInstanceId));

    expect(s.perm("tamer").stack.map((card) => card.cardId)).toEqual(["BT19-016"]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT19-026"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("[On Deletion] with no Tamer on the board does nothing at all", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-026", as: "zeig" }],
          hand: ["BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { security: [...SECURITY], deck: [...FILLER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const zeigInstanceId = s.perm("zeig").topCard!.instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm("zeig").permanentId], "byEffect");
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === zeigInstanceId));

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT19-026"]);
  });

  it("inherited [All Turns] +2000 DP applies under a real digivolution stack, on both players' turns", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT19-025", as: "base" },
            { card: "BT1-014", as: "peer" },
          ],
          hand: [{ card: "BT19-026", as: "zeig" }, { card: "BT1-084", as: "omnimon" }, "BT1-013"],
          deck: [...FILLER],
          security: [...SECURITY],
        },
        1: { security: [...SECURITY], deck: [...FILLER] },
      },
      { autoSelectCards: true, autoChooseOption: true, autoAcceptOptional: true },
    );
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 15;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("zeig").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT19-026");
    expect(s.perm("base").currentDP).toBe(11_000);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("omnimon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT1-084");

    expect(s.perm("base").currentDP).toBe(17_000);
    expect(s.perm("peer").currentDP).toBe(4000);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.phase).toBe(Phase.Main);
    expect(s.state.turnSeat).toBe(1);
    expect(s.perm("base").currentDP).toBe(17_000);
    expect(s.perm("peer").currentDP).toBe(4000);

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
