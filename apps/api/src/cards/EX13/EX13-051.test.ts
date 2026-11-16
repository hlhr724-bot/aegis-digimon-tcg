import { compiledEffects, EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import "../index.js";
import { compiled } from "./EX13-051.js";

const CARD_ID = "EX13-051";

const ALLY_BLOCKER = "BT20-047";
const NEAR_MATCH_KEYWORD = "ST19-07";
const NO_KEYWORD = "BT1-013";
const HOST = "BT1-014";
const DECK = ["BT1-009", "BT1-010", "BT1-011", "BT1-012"];

function combatOf(s: ReturnType<typeof setupEngine>) {
  return (s.engine as unknown as { combat: { hasOpenBlockWindow: boolean; hasOpenCounterWindow: boolean } }).combat;
}

function boardWith(allies: { card: string; as: string }[], opts?: { hostSuspended?: boolean }) {
  return {
    0: {
      battleArea: [
        { card: CARD_ID, as: "guardromon", suspended: opts?.hostSuspended ?? false },
        ...allies.map((ally) => ({ ...ally })),
      ],
      hand: [{ card: "BT1-010", as: "spare" }],
      deck: DECK,
      security: ["BT1-009"],
    },
    1: { hand: [{ card: "BT1-012", as: "spareOpponent" }], deck: DECK, security: ["BT1-010"] },
  };
}

describe("EX13-051 Guardromon", () => {
  it("matches the complete catalog identity and printed text", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      cardId: CARD_ID,
      nameEn: "Guardromon",
      colors: ["Black"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 5000,
      forms: ["Champion"],
      attributes: ["Virus"],
      types: ["Machine"],
      evoCosts: [{ color: "Black", level: 3, memoryCost: 2 }],
      rarity: "U",
    });
    const definition = getCardDefinition(CARD_ID)!;
    expect(definition.effectText).toContain("＜Blocker＞");
    expect(definition.effectText).toContain(
      "[All Turns] When any of your other Digimon with ＜Blocker＞ would leave the battle area other than by your effects, by suspending this Digimon, they don't leave.",
    );
    expect(definition.inheritedEffectText).toBe(
      "[Opponent's Turn] [Once Per Turn] When any of your Digimon suspend, this Digimon may unsuspend.",
    );
    expect(definition.securityEffectText ?? "").toBe("");
  });

  it("compiles every printed clause and nothing else", () => {
    expect(compiled).toMatchObject({ cardId: CARD_ID, coverage: "full", residual: [] });
    expect(compiled.effects).toHaveLength(3);

    expect(compiled.effects[0]).toMatchObject({
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Blocker" }],
    });

    expect(compiled.effects[1]).toMatchObject({
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          leaveCause: "otherThanYourEffect",
          optional: true,
          affectsAll: true,
          sourceFilter: { controller: "mine", kind: ["Digimon"], keywords: ["Blocker"], excludeSelf: true },
          target: {
            filter: { controller: "mine", kind: ["Digimon"], keywords: ["Blocker"], excludeSelf: true },
            count: "all",
          },
          cost: { kind: "suspend", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } },
        },
      ],
    });
    expect(compiled.effects[1]!.frequency).toBeUndefined();

    expect(compiled.effects[2]).toMatchObject({
      trigger: "OpponentsTurn",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { controller: "mine", kind: ["Digimon"] },
          actions: [{ kind: "Unsuspend", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } }],
        },
      ],
    });
    expect(compiled.effects.some((effect) => effect.isSecurity === true)).toBe(false);
    expect(compiled.digivolutionRequirement).toBeUndefined();
    expect(compiled.assemblyRequirement).toBeUndefined();

    expect(registeredCompiledCards.get(CARD_ID)).toEqual(compiled);
    expect(compiledEffects[CARD_ID]).toEqual(compiled);
  });

  it("＜Blocker＞ switches it in as the defender of an opposing attack", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "guardromon" }], deck: DECK, security: ["BT1-009", "BT1-010"] },
        1: { battleArea: [{ card: NO_KEYWORD, as: "attacker", dp: 3000 }], deck: DECK, security: ["BT1-010"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("guardromon"), "Blocker")).toBe(true);
    s.state.turnSeat = 1;
    const combat = combatOf(s);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => combat.hasOpenBlockWindow);
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("guardromon").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.perm("guardromon").isSuspended).toBe(true);
  });

  it("saves an ally ＜Blocker＞ from the opponent's effect by suspending itself", async () => {
    const s = setupEngine(boardWith([{ card: ALLY_BLOCKER, as: "ally" }]), {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });
    await s.ready();
    const allyId = s.perm("ally").permanentId;
    expect(s.perm("guardromon").isSuspended).toBe(false);

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([allyId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual(
      expect.arrayContaining([allyId, s.perm("guardromon").permanentId]),
    );
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("guardromon").isSuspended).toBe(true);
    expect(s.perm("ally").isSuspended).toBe(false);
  });

  it('Q7372: saves EVERY ally ＜Blocker＞ named in one leave for a single suspend ("they don\'t leave")', async () => {
    const s = setupEngine(
      boardWith([
        { card: ALLY_BLOCKER, as: "allyOne" },
        { card: ALLY_BLOCKER, as: "allyTwo" },
      ]),
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const ids = [s.perm("allyOne").permanentId, s.perm("allyTwo").permanentId];

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent(ids, "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea).toHaveLength(3);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.filter(({ isSuspended }) => isSuspended)).toHaveLength(1);
    expect(s.perm("guardromon").isSuspended).toBe(true);
  });

  it("Q7372: prevents every matching Blocker while nonmatching Digimon in the same leave still leave", async () => {
    const s = setupEngine(
      boardWith([
        { card: ALLY_BLOCKER, as: "blockerOne" },
        { card: NO_KEYWORD, as: "nonBlocker" },
        { card: ALLY_BLOCKER, as: "blockerTwo" },
      ]),
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const blockerIds = [s.perm("blockerOne").permanentId, s.perm("blockerTwo").permanentId];
    const nonBlockerId = s.perm("nonBlocker").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([...blockerIds, nonBlockerId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual(
      expect.arrayContaining([s.perm("guardromon").permanentId, ...blockerIds]),
    );
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(nonBlockerId);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual([NO_KEYWORD]);
    expect(s.perm("guardromon").isSuspended).toBe(true);
  });

  it("discriminates ＜Blocker＞ from a near-match keyword and from no keyword at all", async () => {
    for (const victim of [NEAR_MATCH_KEYWORD, NO_KEYWORD]) {
      const s = setupEngine(boardWith([{ card: victim, as: "victim" }]), {
        autoAcceptOptional: true,
        autoSelectCards: true,
      });
      await s.ready();
      const victimId = s.perm("victim").permanentId;

      advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
      expect(await advance(s.engine).verb.deletePermanent([victimId], "byEffect")).toBe(1);
      advance(s.engine).verb.leaveEffectResolution();
      await settle();

      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([CARD_ID]);
      expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual([victim]);
      expect(s.perm("guardromon").isSuspended).toBe(false);
    }
  });

  it("does not protect the OPPONENT's ＜Blocker＞ Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "guardromon" }],
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: DECK,
          security: ["BT1-009"],
        },
        1: { battleArea: [{ card: ALLY_BLOCKER, as: "theirs" }], deck: DECK, security: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const theirsId = s.perm("theirs").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([theirsId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle();

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.perm("guardromon").isSuspended).toBe(false);
  });

  it("cannot save ITSELF: the printed clause watches only your OTHER Digimon", async () => {
    const s = setupEngine(boardWith([{ card: ALLY_BLOCKER, as: "ally" }]), {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });
    await s.ready();
    const hostId = s.perm("guardromon").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([ALLY_BLOCKER]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual([CARD_ID]);
    expect(s.perm("ally").isSuspended).toBe(false);
  });

  it("does NOT prevent a leave caused by the controller's OWN effect", async () => {
    const s = setupEngine(boardWith([{ card: ALLY_BLOCKER, as: "ally" }]), {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });
    await s.ready();
    const allyId = s.perm("ally").permanentId;

    advance(s.engine).verb.enterEffectResolution(0, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([allyId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([CARD_ID]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual([ALLY_BLOCKER]);
    expect(s.perm("guardromon").isSuspended).toBe(false);
  });

  it("prevents a leave with no effect behind it at all (battle), since only your effects are excluded", async () => {
    const s = setupEngine(boardWith([{ card: ALLY_BLOCKER, as: "ally" }]), {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });
    await s.ready();
    const allyId = s.perm("ally").permanentId;

    expect(await advance(s.engine).verb.deletePermanent([allyId], "byBattle")).toBe(0);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(allyId);
    expect(s.perm("guardromon").isSuspended).toBe(true);
  });

  it("cannot pay while already suspended, so the ally leaves", async () => {
    const s = setupEngine(boardWith([{ card: ALLY_BLOCKER, as: "ally" }], { hostSuspended: true }), {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });
    await s.ready();
    const allyId = s.perm("ally").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([allyId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle();

    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual([ALLY_BLOCKER]);
    expect(s.perm("guardromon").isSuspended).toBe(true);
  });

  it("declines the optional window: the ally leaves and nothing suspends", async () => {
    const s = setupEngine(boardWith([{ card: ALLY_BLOCKER, as: "ally" }]), {
      autoDeclineOptional: true,
      autoSelectCards: true,
    });
    await s.ready();
    const allyId = s.perm("ally").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([allyId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle();

    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual([ALLY_BLOCKER]);
    expect(s.perm("guardromon").isSuspended).toBe(false);
  });

  it("is NOT once per turn: a second ally leave in the same turn is prevented again", async () => {
    const s = setupEngine(
      boardWith([
        { card: ALLY_BLOCKER, as: "allyOne" },
        { card: ALLY_BLOCKER, as: "allyTwo" },
      ]),
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const firstId = s.perm("allyOne").permanentId;
    const secondId = s.perm("allyTwo").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([firstId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("guardromon").isSuspended).toBe(true);

    await advance(s.engine).verb.unsuspend([s.perm("guardromon").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([secondId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea).toHaveLength(3);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("guardromon").isSuspended).toBe(true);
  });

  function opposingBoard(guardromons: { as: string; suspended?: boolean }[]) {
    return {
      0: {
        battleArea: [{ card: "EX13-024", as: "slayerdramon", under: ["BT1-010"] }],
        hand: [{ card: "BT8-097", as: "crimsonBlaze" }],
        deck: DECK,
        security: ["BT1-009"],
      },
      1: {
        battleArea: [
          ...guardromons.map((guardromon) => ({ card: CARD_ID, ...guardromon })),
          { card: ALLY_BLOCKER, as: "ally" },
          { card: "EX12-054", as: "plainGuardromon" },
        ],
        deck: DECK,
        security: ["BT1-010"],
      },
    };
  }

  async function useCrimsonBlaze(s: ReturnType<typeof setupEngine>) {
    s.state.memory = 6;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("crimsonBlaze").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT8-097") && s.state.pendingDecision === undefined,
    );
  }

  it("two Guardromon each pay for the other, so Crimson Blaze deletes nothing", async () => {
    const s = setupEngine(opposingBoard([{ as: "first" }, { as: "second" }]), {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });
    await s.ready();

    await useCrimsonBlaze(s);

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([
      CARD_ID,
      CARD_ID,
      ALLY_BLOCKER,
      "EX12-054",
    ]);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.perm("first").isSuspended).toBe(true);
    expect(s.perm("second").isSuspended).toBe(true);
    expect(s.perm("ally").isSuspended).toBe(false);
    expect(s.state.memory).toBe(4);
  });

  it("a lone paying Guardromon saves every other ＜Blocker＞ from Crimson Blaze and is itself deleted", async () => {
    const s = setupEngine(opposingBoard([{ as: "exhausted", suspended: true }, { as: "payer" }]), {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });
    await s.ready();
    const payerInstanceId = s.perm("payer").topCard.instanceId;
    const survivorIds = [s.perm("exhausted"), s.perm("ally"), s.perm("plainGuardromon")].map(
      ({ permanentId }) => permanentId,
    );

    await useCrimsonBlaze(s);

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual(survivorIds);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([payerInstanceId]);
    expect(s.decisions.filter(({ req }) => req.kind === "optional")).toHaveLength(1);
  });

  it("refusing the second Guardromon's payment leaves the first payer to Crimson Blaze", async () => {
    const s = setupEngine(opposingBoard([{ as: "first" }, { as: "second" }]), { autoOrderTriggers: false });
    await s.ready();
    s.state.memory = 6;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("crimsonBlaze").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const order = s.decisions.at(-1)!.req;
    expect(order.options?.triggerCardIds).toEqual([CARD_ID, CARD_ID]);
    expect(order.options?.triggerIsOptional).toEqual([true, true]);

    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: { kind: "orderTriggers", order: [], orderIndexes: [0, 1], optionalAnswersByIndex: [true, false] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT8-097") && s.state.pendingDecision === undefined,
    );

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([
      CARD_ID,
      ALLY_BLOCKER,
      "EX12-054",
    ]);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual([CARD_ID]);
    expect(s.state.players[1]!.battleArea.filter(({ isSuspended }) => isSuspended)).toHaveLength(0);
  });

  it("Slayerdramon's return takes only the lone paying Guardromon and leaves the ＜Blocker＞ Digimon it saved", async () => {
    const s = setupEngine(opposingBoard([{ as: "payer" }]), { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    const survivorIds = [s.perm("ally"), s.perm("plainGuardromon")].map(({ permanentId }) => permanentId);

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("slayerdramon"));
    await settle(() => s.state.players[1]!.battleArea.length === 2 && s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual(survivorIds);
    expect(s.state.players[1]!.deck.at(-1)!.cardId).toBe(CARD_ID);
    expect(s.state.players[1]!.deck).toHaveLength(DECK.length + 1);
    expect(s.state.players[1]!.trash).toHaveLength(0);
  });

  it("two Guardromon keep the whole board against Slayerdramon's return", async () => {
    const s = setupEngine(opposingBoard([{ as: "first" }, { as: "second" }]), {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("slayerdramon"));
    await settle(() => s.perm("first").isSuspended && s.perm("second").isSuspended);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.battleArea).toHaveLength(4);
    expect(s.state.players[1]!.deck).toHaveLength(DECK.length);
    expect(s.state.players[1]!.trash).toHaveLength(0);
  });

  function inheritedBoard(opts?: { allySuspended?: boolean }) {
    return {
      0: {
        battleArea: [
          { card: HOST, as: "host", suspended: true, under: [{ card: CARD_ID, as: "guardromonCard" }] },
          { card: NO_KEYWORD, as: "ally", suspended: opts?.allySuspended ?? false },
        ],
        hand: [{ card: "BT1-010", as: "spare" }],
        deck: DECK,
        security: ["BT1-009"],
      },
      1: { hand: [{ card: "BT1-012", as: "spareOpponent" }], deck: DECK, security: ["BT1-010"] },
    };
  }

  it("unsuspends the host when one of your Digimon suspends on the OPPONENT's turn", async () => {
    const s = setupEngine(inheritedBoard(), { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    s.state.turnSeat = 1;
    expect(s.perm("host").isSuspended).toBe(true);
    expect(s.perm("host").stack.map(({ cardId }) => cardId)).toEqual([CARD_ID]);

    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    await settle(() => s.perm("host").isSuspended === false);

    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.perm("ally").isSuspended).toBe(true);
  });

  it("unsuspends the host when an ally ＜Blocker＞ blocks an attack, through a real combat", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: HOST, as: "host", suspended: true, under: [{ card: CARD_ID, as: "guardromonCard" }] },
            { card: ALLY_BLOCKER, as: "blocker", dp: 20_000 },
          ],
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: DECK,
          security: ["BT1-009", "BT1-010"],
        },
        1: {
          battleArea: [{ card: NO_KEYWORD, as: "attacker", dp: 3000 }],
          hand: [{ card: "BT1-012", as: "spareOpponent" }],
          deck: DECK,
          security: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    const combat = combatOf(s);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => combat.hasOpenBlockWindow);
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    await settle(() => s.perm("host").isSuspended === false);

    expect(s.perm("blocker").isSuspended).toBe(true);
    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(2);
  });

  it("stays suspended on the controller's OWN turn: the printed window is the opponent's turn", async () => {
    const s = setupEngine(inheritedBoard(), { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    expect(s.state.turnSeat).toBe(0);

    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    await settle();

    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("ignores the OPPONENT's Digimon suspending", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: HOST, as: "host", suspended: true, under: [{ card: CARD_ID, as: "guardromonCard" }] }],
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: DECK,
          security: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: NO_KEYWORD, as: "theirs" }],
          hand: [{ card: "BT1-012", as: "spareOpponent" }],
          deck: DECK,
          security: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 1;

    await advance(s.engine).verb.suspend([s.perm("theirs").permanentId]);
    await settle();

    expect(s.perm("host").isSuspended).toBe(true);
  });

  it('declines the printed "may": the host stays suspended', async () => {
    const s = setupEngine(inheritedBoard(), { autoDeclineOptional: true, autoSelectCards: true });
    await s.ready();
    s.state.turnSeat = 1;

    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    await settle();

    expect(s.perm("host").isSuspended).toBe(true);
  });

  it("fires once per opponent turn and resets on the next one", async () => {
    const s = setupEngine(inheritedBoard(), { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    s.state.turnSeat = 1;

    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    await settle(() => s.perm("host").isSuspended === false);
    expect(s.perm("host").isSuspended).toBe(false);

    await advance(s.engine).verb.suspend([s.perm("host").permanentId]);
    await advance(s.engine).verb.unsuspend([s.perm("ally").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("host").isSuspended).toBe(true);

    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    await settle();
    expect(s.perm("host").isSuspended).toBe(true);

    s.state.turnSeat = 0;
    s.state.memory = 3;
    await advance(s.engine).runTurn(0);
    s.state.turnSeat = 1;
    await advance(s.engine).verb.suspend([s.perm("host").permanentId]);
    await advance(s.engine).verb.unsuspend([s.perm("ally").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    await settle(() => s.perm("host").isSuspended === false);
    expect(s.perm("host").isSuspended).toBe(false);
  });

  it("digivolves from a Black Lv.3 for 2 with the bonus draw, keeping the source as a digivolution card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ALLY_BLOCKER, as: "source" }],
          hand: [{ card: CARD_ID, as: "guardromon" }],
          deck: DECK,
          security: ["BT1-009"],
        },
        1: { deck: DECK, security: ["BT1-010"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 5;
    const handSize = s.state.players[0]!.hand.length;
    const sourceInstanceId = s.perm("source").topCard.instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("guardromon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("source").topCard.cardId === CARD_ID);

    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.hand).toHaveLength(handSize);
    expect(s.perm("source").topCard.cardId).toBe(CARD_ID);
    expect(s.perm("source").stack.map(({ instanceId }) => instanceId)).toEqual([sourceInstanceId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(observe(s.engine).hasKeyword(s.perm("source"), "Reboot")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("source"), "Blocker")).toBe(true);
  });

  it("refuses a RED Lv.3 source: the printed route is Black", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: NO_KEYWORD, as: "source" }],
          hand: [{ card: CARD_ID, as: "guardromon" }],
          deck: DECK,
          security: ["BT1-009"],
        },
        1: { deck: DECK, security: ["BT1-010"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("guardromon").instanceId,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(s.state.memory).toBe(5);
    expect(s.perm("source").topCard.cardId).toBe(NO_KEYWORD);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("guardromon").instanceId);
  });

  it("digivolves onto a Black Lv.3 and immediately protects a second ally ＜Blocker＞", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: ALLY_BLOCKER, as: "source" },
            { card: ALLY_BLOCKER, as: "ally" },
          ],
          hand: [{ card: CARD_ID, as: "guardromon" }],
          deck: DECK,
          security: ["BT1-009"],
        },
        1: { deck: DECK, security: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("guardromon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("source").topCard.cardId === CARD_ID);
    const allyId = s.perm("ally").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([allyId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(allyId);
    expect(s.perm("source").isSuspended).toBe(true);
  });
});
