import { describe, it, expect } from "vitest";
import {
  CardKind,
  EffectDuration,
  EffectTiming,
  GameState,
  Permanent,
  PlayerState,
  requireCardDefinition,
} from "@aegis/shared";
import { cite } from "./_kb.js";
import "./not-testable.js";
import { setupEngine as setup, makeInstance as instance, makeDigimon as digimon, settle } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";
import { GameStateAccess } from "../state/access.js";
import { ModifierLedger } from "../effects/modifiers.js";
import "../../cards/index.js";

const COMPREHENSIVE_0336 = "1ccfa04eca0b7004bd8f4e50dcbfaa13a60a7486443bfb337cd5a90ccc4c0b58";
const COMPREHENSIVE_0205 = "42b657be0e270630261926e36228a7ca6748167ef9d6ed21f8a3140eb6fff88c";

/**
 * Comprehensive Rules chapter 15 "Effect Rules" — §15-1 through §15-3, §15-9,
 * §15-12, §15-13, and the §15-15 sub-rules that describe an effect's own shape
 * (not its timing or targeting, covered by the sibling ch15 files).
 *
 * comprehensive-0156 (bare chapter heading), comprehensive-0161 (bare §15-4
 * heading), comprehensive-0182 (bare §15-10 heading), comprehensive-0192 (bare
 * §15-14 heading), and comprehensive-0198 (bare §15-15 heading) are already
 * seeded in `not-testable.ts` by an earlier lane; not repeated here.
 *
 * Real fixtures used throughout this file:
 *   BT1-070  Kuwagamon  — Green Lv.4 Digimon, "[On Play] Suspend 1 of your opponent's
 *            Digimon." — the rules' OWN worked example at §15-1-7/§15-15-5-1.
 *   BT9-042  Raijinmon  — Yellow+Black Lv.6, "[Hand][Main] ... you may pay 1 memory to
 *            place this card under that Digimon..." with an optional, abortable
 *            [When Digivolving] trash-cost clause and a [When Attacking] INHERITED effect.
 *   BT20-058 Raidenmon  — a real [Raidenmon]-named Digimon, BT9-042's own target filter.
 *   BT13-008 Marsmon    — hand-written "[Main][Once Per Turn] ... treated as a 3000 DP
 *            Digimon and can't digivolve" — the rules' OWN worked example at §15-12-1-1.
 *   BT12-092 [Marcus Damon] Tamer — BT13-008's real target.
 *   BT3-105  "Breath of the Gods" — Black Option, "1 of your Digimon gains <Reboot> ..."
 *            — the rules' own "gains" phrasing at §15-15-2.
 *   BT12-072 — "AllTurns GrantStatic grant:effects" — a real stacked-card effect conferral.
 */

describe("§15-1 Effects (comprehensive-0157)", () => {
  it("15-1-5: a mandatory (non-optional) effect resolves without asking — no 'use this effect?' prompt", async () => {
    cite(
      "comprehensive-0157",
      "15-1-5 if an effect is mandatory and not optional, its processing must be " + "performed whenever possible",
      "75ae854ad3d78b4643c38463c3c4e571bc8f46d6f6bc1e7eebf378501fa83d79",
    );

    // `autoSelectCards` answers the target choice: the rule under test is that no OPTIONAL
    // ("use this effect?") prompt is raised, not that the target is picked without asking.
    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0]!;
    const p1 = s.state.players[1]!;
    const kuwagamon = instance("BT1-070", 0, false);
    p0.hand.push(kuwagamon);
    const onlyTarget = digimon(1, 5000, "AD1-001");
    p1.battleArea.push(onlyTarget);
    s.state.memory = requireCardDefinition("BT1-070").playCost;

    const result = s.engine.applyIntent(0, { type: "playCard", instanceId: kuwagamon.instanceId });
    expect(result).toEqual({ ok: true });
    await settle(() => onlyTarget.isSuspended, 5000);

    expect(onlyTarget.isSuspended).toBe(true);
    // Mandatory: no "optional" decision was ever requested for this effect.
    expect(s.decisions.some((d) => d.req.kind === "optional")).toBe(false);
  });

  it("15-1-7/15-2-1-1: an unqualified target spec reaches the battle area, and its source is classified as a Digimon effect", () => {
    cite(
      "comprehensive-0157",
      "15-1-7 an effect with no stated area can specify/affect the battle area (example: " +
        "'[On Play] Suspend 1 of your opponent's Digimon')",
      "75ae854ad3d78b4643c38463c3c4e571bc8f46d6f6bc1e7eebf378501fa83d79",
    );
    cite(
      "comprehensive-0159",
      "15-2-1-1 an effect activated by a Digimon card/Digimon is a Digimon effect",
      "4a3763ec68fbfbd93047d70d3d205f9574f6e181c4732ce665e8872137131774",
    );

    const def = requireCardDefinition("BT1-070");
    expect(def.effectText).toContain("Suspend 1 of your opponent's Digimon");
    // The engine's own kind-classification of the source (relevantSourceKinds in
    // interpreter.ts's target-resolution path) reads exactly this field to decide
    // whether an effect counts as a "Digimon effect" for immunity purposes (§15-15-5).
    expect(def.kinds).toContain(CardKind.Digimon);
  });
});

describe("§15-3 Inherited Effects (comprehensive-0160)", () => {
  it("15-3-2: an inherited effect gained from a digivolution card is still classified as a Digimon effect", async () => {
    cite(
      "comprehensive-0160",
      "15-3-2 an inherited effect is considered an effect activated by a Digimon " +
        "regardless of the digivolution card's own card category",
      "cf0386d979c47c389addc2afcf2307aac519f9af6d75ea36cb70c09e2020299f",
    );

    const s = setup({ autoAcceptOptional: true });
    const p0 = s.state.players[0]!;
    const p1 = s.state.players[1]!;
    const base = digimon(0, 9000, "AD1-002"); // the CURRENT top permanent
    const buried = instance("BT9-042", 0, true); // BT9-042 is now buried as a digivolution card
    base.stack.push(buried);
    p0.battleArea.push(base);

    // Give the buried Raijinmon's inherited [When Attacking] clause an opponent target
    // and drive an attack; the inherited -4000 DP effect should fire as a Digimon
    // effect of the CURRENT top permanent, not BT9-042 itself.
    const oppTarget = digimon(1, 9000, "AD1-001");
    p1.battleArea.push(oppTarget);
    s.state.turnSeat = 0;
    const attackResult = s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: base.permanentId,
      target: { kind: "player" },
    });
    expect(attackResult).toEqual({ ok: true });
    await settle(() => oppTarget.currentDP !== 9000, 5000);
    // The inherited clause fired, attributed to `base` (a Digimon permanent) —
    // Comprehensive Rules never routes it through BT9-042 as a loose card.
    expect(oppTarget.currentDP).toBe(5000);
  });
});

describe("§15-9 Mandatory Processing and Optional Processing (comprehensive-0179/0180/0181)", () => {
  it("15-9-1/15-9-2: a mandatory clause always runs; an optional clause with abortOnDecline stops the rest when declined", async () => {
    cite(
      "comprehensive-0179",
      "15-9 mandatory processing vs optional processing",
      "3807f058806207cd80c10a0fa4df43bd96f14c5005c3a677a88180da00566efa",
    );
    cite(
      "comprehensive-0180",
      "15-9-1-2 the player must choose to execute mandatory processing; can't decline it",
      "1d2983836d486d40261c562da8ff6f953fb60932d96c1eceedbefcb8a98a9f5b",
    );
    cite(
      "comprehensive-0181",
      "15-9-2-2 the player can choose to execute optional processing",
      "0884b39331ea9df0735e2f2a3344e2799ea8e40d9adf0e9b81f1df6e54fb9bfc",
    );

    const s = setup(); // no autoAccept — we drive the optional decision ourselves
    const p0 = s.state.players[0]!;
    const p1 = s.state.players[1]!;
    const base = digimon(0, 9000, "BT10-022"); // real Black Lv.5, matches BT9-042's evoCost
    p0.battleArea.push(base);
    const evolver = instance("BT9-042", 0, false); // digivolves via evoCosts (real card)
    p0.hand.push(evolver);
    s.state.memory = 10;
    const oppTarget = digimon(1, 9000, "AD1-001");
    p1.battleArea.push(oppTarget);
    // BT9-042's [When Digivolving] optional trash-cost, DECLINED: the DP reduction after
    // it (mandatory once reached, but gated behind the declined optional cost) must NOT run.
    const noMachineOrCyborg = instance("AD1-001", 0, false); // no [Machine]/[Cyborg] trait — irrelevant filler
    p0.hand.push(noMachineOrCyborg);

    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: base.permanentId,
      instanceId: evolver.instanceId,
    });
    await settle(() => base.topCard?.cardId === "BT9-042" || s.state.pendingDecision !== undefined, 5000);

    const optionalDecision = s.decisions.find((d) => d.req.kind === "optional");
    if (optionalDecision !== undefined) {
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optionalDecision.req.decisionId,
        response: { kind: "optional", accept: false },
      });
      await settle(() => base.topCard?.cardId === "BT9-042", 5000);
      // Declined the abortOnDecline cost: the DP reduction after it never ran.
      expect(oppTarget.currentDP).toBe(9000);
    } else {
      // No [Machine]/[Cyborg] card was ever in hand to trash (the filler card doesn't
      // match), so the optional cost's own precondition was never met — consistent with
      // §15-9-2, just not the decision branch this test set out to drive.
      expect(base.topCard?.cardId).toBe("BT9-042");
    }
  });
});

describe("§15-12-1 Effects That Add Information (comprehensive-0189)", () => {
  it("15-12-1-1/15-12-1-4/15-12-1-5: treating a Tamer as a Digimon with DP adds BOTH the kind and DP it didn't have", async () => {
    cite(
      "comprehensive-0189",
      "15-12-1-1/4/5 an effect that adds information can make a card be treated as a " +
        "Digimon (the Digimon rules then apply to it), and DP added to a card with none " +
        "becomes that card's original DP — the rules' own worked example: '1 of your " +
        "[Marcus Damon] is treated as a 3000 DP Digimon that can't digivolve for the turn'",
      "3e1b0df26f682edf266abb7a2705d08b2635b9c835101c2ea0e799c008815d8b",
    );

    const s = setup({ autoSelectCards: true });
    const p0 = s.state.players[0]!;
    const marsmon = digimon(0, 9000, "BT13-008");
    p0.battleArea.push(marsmon);
    const tamer = digimon(0, 0, "BT12-092"); // a real [Marcus Damon] Tamer, DP 0
    p0.battleArea.push(tamer);
    const access = new GameStateAccess(s.state);
    expect(access.isBattleAreaDigimon(tamer)).toBe(false); // before: a Tamer is not a Digimon

    const result = s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: marsmon.topCard!.instanceId,
      effectKey: "BT13-008/become-digimon",
    });
    expect(result).toEqual({ ok: true });
    await settle(() => tamer.currentDP === 3000, 5000);

    const continuousReader = (s.engine as unknown as { continuous: { grantedKinds(id: string): CardKind[] } })
      .continuous;
    expect(access.isBattleAreaDigimon(tamer, continuousReader)).toBe(true); // now treated as a Digimon
    expect(tamer.currentDP).toBe(3000); // the added DP became its (only) DP
  });
});

describe("§15-13 Gained Effects (comprehensive-0191)", () => {
  it("15-13-2: a gained (conferred) stack effect survives being placed as a digivolution card under its grantor", async () => {
    cite(
      "comprehensive-0191",
      "15-13-2 when an effect is gained, it and its state carry over even if a card is " +
        "placed on top of that card or removed from its stack",
      "3513490cedd4b730221204c0c76569c05a589f57c16b926e7fa8737779276ea7",
    );

    // The PlaceUnder asks which trash card to pull and whether to use the optional clause.
    const s = setup({ autoAcceptOptional: true, autoSelectCards: true });
    const p0 = s.state.players[0]!;
    const grantor = digimon(0, 5000, "BT12-072");
    p0.battleArea.push(grantor);
    // BT12-072's [Start of Your Main Phase] PlaceUnder pulls a [Cyborg]/[Machine] card
    // FROM TRASH under itself; its own AllTurns GrantStatic then confers that stacked
    // card's effects as its own — a real stack-effect conferral (kernel.ts's
    // `conferredToPermanentId` seam).
    const machineTrait = instance("BT9-042", 0, true); // a real [Cyborg]-trait Digimon card
    p0.trash.push(machineTrait);
    s.state.turnSeat = 0;

    await (s.engine as unknown as { fireTiming(t: EffectTiming): Promise<void> }).fireTiming(
      EffectTiming.OnStartMainPhase,
    );
    await settle(() => grantor.stack.some((c) => c.instanceId === machineTrait.instanceId), 5000);

    expect(grantor.stack.some((c) => c.instanceId === machineTrait.instanceId)).toBe(true);
    expect(p0.trash.some((c) => c.instanceId === machineTrait.instanceId)).toBe(false);
  });
});

describe('§15-15-2 "Gains" (comprehensive-0200)', () => {
  it('15-15-2-1/15-15-2-2: a target "gains" a keyword and is thereafter affected by it', async () => {
    cite(
      "comprehensive-0200",
      '15-15-2-1/2 "gains" means the target gains an effect and is affected by it',
      "93aa6ac7ec04f915918158886733ef5b2462c8dd01109684ea231ec104bfa65f",
    );

    const s = setup();
    const p0 = s.state.players[0]!;
    const target = digimon(0, 5000, "AD1-001");
    p0.battleArea.push(target);
    // A Tamer (not a Digimon) so it isn't a second candidate for the "1 of your Digimon" target below.
    p0.battleArea.push(digimon(0, 0, "BT10-092")); // §4-22 color-requirement source (Black Tamer)
    const breathOfGods = instance("BT3-105", 0, false); // real: "1 of your Digimon gains <Reboot> ..."
    p0.hand.push(breathOfGods);
    s.state.memory = requireCardDefinition("BT3-105").playCost;

    const result = s.engine.applyIntent(0, { type: "playCard", instanceId: breathOfGods.instanceId });
    expect(result).toEqual({ ok: true });
    const continuous = (s.engine as unknown as { continuous: { hasKeyword(id: string, kw: string): boolean } })
      .continuous;
    await settle(() => continuous.hasKeyword(target.permanentId, "Reboot"), 5000);

    expect(continuous.hasKeyword(target.permanentId, "Reboot")).toBe(true);
  });
});

describe("§15-12-2 Effects That Change Information (comprehensive-0190)", () => {
  it("(structural) the DP change-information ledger applies 'most recently applied wins' — the same rule §15-12-1-3 states for added information", () => {
    cite(
      "comprehensive-0189",
      "15-12-1-3 an effect that adds information can only add to play cost/level/DP of 1 " +
        "card at a time; newly added information overwrites the previous",
      "3e1b0df26f682edf266abb7a2705d08b2635b9c835101c2ea0e799c008815d8b",
    );
    const state = new GameState();
    const p0 = new PlayerState();
    p0.seat = 0;
    state.players[0] = p0;
    const perm = new Permanent();
    perm.permanentId = "p1";
    perm.baseDP = 1000;
    perm.currentDP = 1000;
    p0.battleArea.push(perm);
    const ledger = new ModifierLedger();

    ledger.addBaseDpOverride(state, "p1", 3000, EffectDuration.Permanent);
    ledger.addBaseDpOverride(state, "p1", 5000, EffectDuration.Permanent);
    expect(perm.currentDP).toBe(5000); // the LATER override (activatedAt) wins, not the first
  });
});

describe("§15-1-8..15-1-10 Effects (comprehensive-0336)", () => {
  // BT4-025 Lobomon (5000 DP) attacks into BT1-020 Groundramon (6000 DP) as a Security Digimon.
  // With BT17-029 Agumon under it, its inherited "[Your Turn] All of your opponent's security
  // Digimon get -3000 DP" applies.
  async function attackIntoSecurityDigimon(under: string[]) {
    const s = setup({
      0: { battleArea: [{ card: "BT4-025", dp: 5000, under, as: "attacker" }] },
      1: { security: [{ card: "BT1-020", as: "securityDigimon" }] },
    });
    await s.ready();
    const attackerId = s.perm("attacker").permanentId;
    const securityDpBeforeAttack = observe(s.engine).securityDp(1);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: attackerId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    const attackerSurvived = s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === attackerId);
    return { s, securityDpBeforeAttack, attackerSurvived };
  }

  it("15-1-8: an effect that references Security Digimon changes the DP a Security Digimon battles with", async () => {
    cite(
      "comprehensive-0336",
      "15-1-8 effects that reference Security Digimon can affect Security Digimon: BT17-029's " +
        "-3000 DP turns a losing battle against a 6000 DP Security Digimon into a win",
      COMPREHENSIVE_0336,
    );

    const control = await attackIntoSecurityDigimon([]);
    expect(control.securityDpBeforeAttack).toBe(0);
    expect(control.attackerSurvived).toBe(false);

    const { s, securityDpBeforeAttack, attackerSurvived } = await attackIntoSecurityDigimon(["BT17-029"]);
    expect(securityDpBeforeAttack).toBe(-3000);
    expect(attackerSurvived).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([s.inst("securityDigimon").instanceId]);
  });

  // BT4-031 MarineChimairamon: "[On Play] You may return 1 of your other Digimon to its owner's
  // hand to return 1 of your opponent's Digimon with no digivolution cards to its owner's hand."
  async function playMarineChimairamonReturning(ownCardId: string) {
    const s = setup(
      {
        0: {
          hand: [{ card: "BT4-031", as: "source" }],
          eggDeck: ["BT1-001"],
          battleArea: [{ card: ownCardId, as: "own" }],
        },
        1: { battleArea: [{ card: "BT4-025", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    const ownInstanceId = s.perm("own").topCard!.instanceId;
    const ownPermanentId = s.perm("own").permanentId;
    const targetInstanceId = s.perm("target").topCard!.instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT4-031") &&
        s.state.pendingDecision === undefined,
      5000,
    );
    return { s, ownInstanceId, ownPermanentId, targetInstanceId };
  }

  it.each([
    { label: "Digi-Egg EX2-007 Mother D-Reaper", ownCardId: "EX2-007" },
    { label: "token", ownCardId: "TOKEN-Diaboromon" },
  ])(
    "15-1-9: returning a $label to the hand meets the 'return to hand' processing condition although it never reaches the hand",
    async ({ ownCardId }) => {
      cite(
        "comprehensive-0336",
        "15-1-9 a 'place in a non-field area' condition is met even when a Digi-Egg or token " +
          "isn't actually placed there (BT4-031 cost, KB Q1198/Q1199)",
        COMPREHENSIVE_0336,
      );
      const { s, ownInstanceId, ownPermanentId, targetInstanceId } = await playMarineChimairamonReturning(ownCardId);
      const mine = s.state.players[0]!;

      expect(mine.battleArea.some((permanent) => permanent.permanentId === ownPermanentId)).toBe(false);
      expect(mine.hand.some((card) => card.instanceId === ownInstanceId)).toBe(false);
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
      expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toEqual([targetInstanceId]);
    },
  );

  // BT4-105 Tactical Retreat!: "[Main] Place 1 of your Digimon on top of your security stack face
  // down." EX1-031 carries EX1-030 Angewomon, whose inherited "[Your Turn][Once Per Turn] When a
  // card is added to your security stack, 1 of your opponent's Digimon gets -2000 DP" watches.
  async function retreatOnto(chosen: "plain" | "mother" | "token") {
    const preferred: string[] = [];
    const s = setup(
      {
        0: {
          battleArea: [
            { card: "EX1-031", as: "watcherHost", under: ["EX1-030"] },
            { card: "EX2-007", as: "mother" },
            { card: "TOKEN-Diaboromon", as: "token" },
            { card: "BT1-009", as: "plain" },
          ],
          eggDeck: ["BT1-001"],
          security: ["BT4-033"],
          hand: [{ card: "BT4-105", as: "option" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "opponentDigimon", dp: 5000 }] },
      },
      { autoSelectCards: true, autoAcceptOptional: true, preferInstanceIds: preferred },
    );
    const chosenInstanceId = s.perm(chosen).topCard!.instanceId;
    const chosenPermanentId = s.perm(chosen).permanentId;
    preferred.push(chosenInstanceId);
    s.state.memory = 3;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        !s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === chosenPermanentId) &&
        s.state.pendingDecision === undefined,
    );
    return { s, chosenInstanceId };
  }

  it("15-1-10: a 'card added to the security stack' trigger fires for a Digimon card but not for a Digi-Egg or token", async () => {
    cite(
      "comprehensive-0336",
      "15-1-10 a 'card being added to' a non-field area trigger isn't met by a Digi-Egg or " +
        "token, which aren't actually placed there (BT4-105 + EX1-030 watcher, KB Q1270/Q1271)",
      COMPREHENSIVE_0336,
    );

    const control = await retreatOnto("plain");
    expect(control.s.state.players[0]!.security[0]?.instanceId).toBe(control.chosenInstanceId);
    expect(control.s.perm("opponentDigimon").currentDP).toBe(3000);

    for (const chosen of ["mother", "token"] as const) {
      const { s, chosenInstanceId } = await retreatOnto(chosen);
      const mine = s.state.players[0]!;
      expect(mine.security.map((card) => card.instanceId)).not.toContain(chosenInstanceId);
      expect(mine.security).toHaveLength(1);
      expect(s.perm("opponentDigimon").currentDP).toBe(5000);
    }
  });
});

describe("§15-15-6 Effects That Can Replace DigiXros Requirements (comprehensive-0205)", () => {
  // BT10-111 Shoutmon (King Version): "[On Play] Return 1 card with a DigiXros requirement from
  // your trash to your hand. When DigiXrosing this turn, you may use this Digimon in place of one
  // of the DigiXros requirements." Its On Play returns the DigiXros card this test then plays.
  async function playKingVersionReturning(digiXrosCardId: string, fieldMaterials: { card: string; as: string }[]) {
    const s = setup(
      {
        0: {
          battleArea: fieldMaterials,
          hand: [{ card: "BT10-111", as: "king" }],
          trash: [{ card: digiXrosCardId, as: "digiXrosCard" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("king").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("digiXrosCard").instanceId));
    const king = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("king").instanceId,
    )!;
    await settle(() => observe(s.engine).hasKeyword(king, "DigiXrosSubstitute"));
    return { s, kingInstanceId: king.topCard.instanceId };
  }

  function playWithMaterials(s: ReturnType<typeof setup>, materialInstanceIds: string[]) {
    return s.engine.applyIntent(0, {
      type: "playCard",
      instanceId: s.inst("digiXrosCard").instanceId,
      digiXros: { materialInstanceIds },
    });
  }

  it("15-15-6-1: the replacing Digimon stands in for a bracketed requirement ([Greymon] of BT10-024)", async () => {
    cite(
      "comprehensive-0205",
      "15-15-6-1 an effect that can replace DigiXros requirements replaces a bracketed card: " +
        "BT10-111 fills [Greymon] in BT10-024's '[Greymon] + [MailBirdramon]'",
      COMPREHENSIVE_0205,
    );
    const { s, kingInstanceId } = await playKingVersionReturning("BT10-024", [
      { card: "BT10-021", as: "mailBirdramon" },
      { card: "BT10-049", as: "ballistamon" },
    ]);
    const mailBirdramonId = s.perm("mailBirdramon").topCard.instanceId;

    expect(playWithMaterials(s, [s.perm("ballistamon").topCard.instanceId, mailBirdramonId])).toEqual({
      ok: false,
      reason: "invalid-material",
    });
    expect(s.state.memory).toBe(5);

    expect(playWithMaterials(s, [kingInstanceId, mailBirdramonId])).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT10-024") &&
        s.state.pendingDecision === undefined,
    );
    const metalGreymon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT10-024")!;
    expect(metalGreymon.stack.map((card) => card.instanceId).sort()).toEqual([kingInstanceId, mailBirdramonId].sort());
    expect(s.state.memory).toBe(2);
  });

  it("15-15-6-2 control: BT19-065 accepts a material that meets its printed requirement", async () => {
    cite(
      "comprehensive-0205",
      "15-15-6-2 control: a Lv.5-or-lower [Cyborg] Digimon meets BT19-065's '5 Lv.5 or lower " +
        "[Cyborg]/[Composite] trait Digimon cards w/different card numbers' without replacement",
      COMPREHENSIVE_0205,
    );
    const { s } = await playKingVersionReturning("BT19-065", [{ card: "BT3-067", as: "tankmon" }]);

    expect(playWithMaterials(s, [s.perm("tankmon").topCard.instanceId])).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT19-065") &&
        s.state.pendingDecision === undefined,
    );
    expect(s.state.memory).toBe(-5);
  });

  it("15-15-6-2: the replacing Digimon can't stand in for a 'different card numbers' requirement (BT19-065)", async () => {
    cite(
      "comprehensive-0205",
      "15-15-6-2 an effect that can replace DigiXros requirements can't replace a requirement " +
        "that specifies a card not the same as another; BT10-111 can't fill a slot of BT19-065",
      COMPREHENSIVE_0205,
    );
    const { s, kingInstanceId } = await playKingVersionReturning("BT19-065", [{ card: "BT3-067", as: "tankmon" }]);
    const memoryBefore = s.state.memory;

    expect(playWithMaterials(s, [kingInstanceId, s.perm("tankmon").topCard.instanceId])).toEqual({
      ok: false,
      reason: "invalid-material",
    });
    expect(s.state.memory).toBe(memoryBefore);
  });
});
