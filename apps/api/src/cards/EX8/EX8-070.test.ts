import { describe, expect, it } from "vitest";
import { getCardDefinition, PlayerState } from "@aegis/shared";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import "./index.js";
import { compiled } from "./EX8-070.js";

describe("EX8-070", () => {
  it("matches the committed catalog identity and every printed text field", () => {
    expect(getCardDefinition("EX8-070")).toMatchObject({
      cardId: "EX8-070",
      nameEn: "Zofr Kabus",
      colors: ["Black"],
      kinds: ["Option"],
      playCost: 2,
      dp: 0,
      forms: ["-"],
      attributes: ["-"],
      types: ["LIBERATOR"],
      evoCosts: [],
      effectText:
        "[Main] By trashing any 1 digivolution card of 1 of your Digimon with the [Mineral]/[Rock]\u00a0trait, until the end of your opponent's turn, that Digimon gains ＜Collision＞ , ＜Piercing＞ , ＜Reboot＞ , and your opponent's effects can't return it to hands or decks, and it gets +3000 DP.",
      securityEffectText: "[Security] Delete 1 of your opponent’s Digimon with the lowest play cost.",
    });
  });
  it("selects a Mineral/Rock Digimon with digivolution cards and gives it Collision, Piercing, Reboot, +3000 DP, and return protection", () => {
    const actions = compiled.effects?.find((entry) => entry.trigger === "Main")?.actions ?? [];
    const mainEffectTextPart =
      "[Main] By trashing any 1 digivolution card of 1 of your Digimon with the [Mineral]/[Rock]\u00a0trait, until the end of your opponent's turn, that Digimon gains ＜Collision＞ , ＜Piercing＞ , ＜Reboot＞ , and your opponent's effects can't return it to hands or decks, and it gets +3000 DP.";
    expect(actions).toHaveLength(6);
    expect(actions[0]).toMatchObject({
      kind: "SelectBind",
      optional: true,
      target: {
        bindAs: "thatDigimon",
        filter: {
          controller: "mine",
          kind: ["Digimon"],
          nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }],
          digivolutionCards: "hasAny",
        },
      },
      cost: { kind: "trash" },
    });
    expect(actions.slice(1).map((action) => action.kind)).toEqual([
      "GainKeyword",
      "GainKeyword",
      "GainKeyword",
      "Restrict",
      "ModifyDP",
    ]);
    expect(actions[4]).toMatchObject({
      kind: "Restrict",
      restriction: "cannotReturnToHandOrDeck",
      byOpponentEffectsOnly: true,
    });
    expect(actions[5]).toMatchObject({ kind: "ModifyDP", amount: 3000, duration: "untilOpponentTurnEnd" });
    expect(actions[1]).toEqual({
      effectTextPart: mainEffectTextPart,
      kind: "GainKeyword",
      target: { fromSelectionRef: "thatDigimon", filter: {}, count: 1 },
      keyword: { keyword: "Collision", raw: "＜Collision＞" },
      duration: "untilOpponentTurnEnd",
    });
    expect(actions[2]).toEqual({
      effectTextPart: mainEffectTextPart,
      kind: "GainKeyword",
      target: { fromSelectionRef: "thatDigimon", filter: {}, count: 1 },
      keyword: { keyword: "Piercing", raw: "＜Piercing＞" },
      duration: "untilOpponentTurnEnd",
    });
    expect(actions[3]).toEqual({
      effectTextPart: mainEffectTextPart,
      kind: "GainKeyword",
      target: { fromSelectionRef: "thatDigimon", filter: {}, count: 1 },
      keyword: { keyword: "Reboot", raw: "＜Reboot＞" },
      duration: "untilOpponentTurnEnd",
    });
  });
  it("contains the exact Security deletion and mandatory Main sequence", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "Security")).toEqual({
      trigger: "Security",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: { controllerDefault: "opponent", kind: ["Digimon"], superlative: "lowestPlayCost" },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    });
    expect(compiled.effects).toHaveLength(2);
  });
  it("deletes the exact lowest-play-cost opposing Digimon when revealed in security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "AD1-001", as: "attacker" },
            { card: "BT1-010", as: "lowest" },
            { card: "AD1-001", as: "higher" },
          ],
        },
        1: { security: [{ card: "EX8-070", as: "option" }] },
      },
      { autoSelectCards: true },
    );
    const lowestInstanceId = s.perm("lowest").topCard!.instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => (s.state.players[0] as PlayerState).trash.some((card) => card.instanceId === lowestInstanceId));

    expect((s.state.players[0] as PlayerState).trash.some((card) => card.instanceId === lowestInstanceId)).toBe(true);
    expect(
      (s.state.players[0] as PlayerState).battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.perm("higher").topCard?.instanceId,
      ),
    ).toBe(true);
  });
  it("applies all five Main grants to the selected Mineral host after paying the stack cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX8-048", as: "mineral", under: ["EX8-047"] }],
          hand: [{ card: "EX8-070", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    const baseDP = s.perm("mineral").currentDP;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("mineral").stack.length === 0 && s.perm("mineral").currentDP === baseDP + 3000);

    expect(s.perm("mineral").stack).toHaveLength(0);
    expect(observe(s.engine).hasKeyword(s.perm("mineral"), "Collision")).toBe(true);
    expect(observe(s.engine).hasPierce(s.perm("mineral"))).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("mineral"), "Reboot")).toBe(true);
    expect(s.perm("mineral").currentDP).toBe(baseDP + 3000);
    expect(observe(s.engine).hasRestriction(s.perm("mineral"), "beReturned")).toBe(true);

    s.state.memory = 0;
    s.state.turnSeat = 1;
    await advance(s.engine).runTurn(1);
    expect(s.perm("mineral").currentDP).toBe(baseDP);
    expect(observe(s.engine).hasKeyword(s.perm("mineral"), "Collision")).toBe(false);
    expect(observe(s.engine).hasRestriction(s.perm("mineral"), "beReturned")).toBe(false);
  });
  it("may decline without trashing a source or granting any benefit", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX8-048", as: "mineral", under: ["EX8-047"] }],
        hand: [{ card: "EX8-070", as: "option" }],
      },
    });
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
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
    expect(s.perm("mineral").stack).toHaveLength(1);
    expect(s.perm("mineral").currentDP).toBe(s.perm("mineral").baseDP);
    expect(observe(s.engine).hasKeyword(s.perm("mineral"), "Collision")).toBe(false);
  });
  it("asks its yes/no before choosing between two Mineral hosts, and declining picks nothing", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX8-048", as: "firstMineral", under: ["EX8-047"] },
          { card: "EX8-048", as: "secondMineral", under: ["EX8-047"] },
        ],
        hand: [{ card: "EX8-070", as: "option" }],
      },
    });
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision !== undefined);
    const first = s.decisions.find(({ req }) => req.sourceCardId === "EX8-070")!.req;
    expect(first.kind).toBe("optional");

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: first.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX8-070")).toHaveLength(1);
    expect(s.perm("firstMineral").stack).toHaveLength(1);
    expect(s.perm("secondMineral").stack).toHaveLength(1);
  });

  it("blocks an opponent effect from returning the granted host to hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX8-048", as: "mineral", under: ["EX8-047"] }],
          hand: [{ card: "EX8-070", as: "option" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasRestriction(s.perm("mineral"), "beReturned"));

    const driver = advance(s.engine);
    driver.verb.enterEffectResolution(1, ["Digimon"]);
    await driver.verb.returnToHand([s.perm("mineral").topCard.instanceId]);
    driver.verb.leaveEffectResolution();

    expect(s.perm("mineral").topCard.cardId).toBe("EX8-048");
    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === s.perm("mineral").permanentId),
    ).toBe(true);
  });
});
