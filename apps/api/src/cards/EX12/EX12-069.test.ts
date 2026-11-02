import { compiledEffects, EffectDuration, EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { compiled } from "./EX12-069.js";
import {
  expectFaceUpSecurityCheckedLikeStandard,
  expectFaceUpSecurityEffectTriggers,
  expectFaceUpSecurityStaysRevealed,
  expectShuffleTurnsFaceUpSecurityDown,
  expectUseWithEmptySecurity,
  type FaceUpSecurityOption,
} from "./faceUpSecurityOption.testSupport.js";
import "../index.js";

const CARD_ID = "EX12-069";

describe("EX12-069 Virus Busters", () => {
  it("maps the KB-backed security trigger, main self-placement, and security play", () => {
    const securityTurn = compiled.effects.find((effect) => effect.trigger === "YourTurn" && effect.isSecurity)!;
    const main = compiled.effects.find((effect) => effect.trigger === "Main")!;
    const securitySkill = compiled.effects.find((effect) => effect.trigger === "Security" && effect.isSecurity)!;

    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(securityTurn.actions[0]).toMatchObject({
      kind: "SubTrigger",
      event: "whenAttacking",
      sourceFilter: {
        controller: "mine",
        kind: ["Digimon"],
        levelComparison: { op: "gte", value: 4 },
        nameOrTrait: [{ tokens: ["VB"], match: "trait" }],
      },
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["hand"],
          payCost: true,
          reduceCostBy: 3,
          optional: true,
          target: { filter: { sameLevelAsAttacker: true } },
        },
      ],
    });
    expect(main.actions).toEqual([
      {
        effectTextPart:
          "[Main] Add your bottom security card to the hand and place this card face up as the bottom security card.",
        kind: "SecurityManipulation",
        op: "toHand",
        controller: "mine",
        amount: 1,
        toTop: false,
      },
      {
        effectTextPart:
          "[Main] Add your bottom security card to the hand and place this card face up as the bottom security card.",
        kind: "SecurityManipulation",
        op: "placeAsSecurity",
        controller: "mine",
        toTop: false,
        faceUp: true,
      },
    ]);
    expect(main.actions[1]).not.toHaveProperty("source");
    expect(securitySkill).toMatchObject({
      isSecurity: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["hand"],
          payCost: false,
          optional: true,
          target: {
            filter: {
              kind: ["Digimon"],
              levelComparison: { op: "lte", value: 5 },
            },
          },
        },
      ],
    });
    expect(registeredCompiledCards.get(CARD_ID)).toEqual(compiled);
    expect(compiledEffects[CARD_ID]).toEqual(compiled);
  });

  it("adds itself face up to the bottom of security after returning the bottom card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-017", as: "vb" }],
          hand: [{ card: CARD_ID, as: "option" }],
          security: [
            { card: "BT1-101", as: "top" },
            { card: "BT1-101", as: "bottom" },
          ],
        },
        1: { security: ["BT1-101"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 2;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.at(-1)?.cardId === CARD_ID, 160);

    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-101")).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("option").instanceId)).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[0]!.security.at(-1)).toMatchObject({ cardId: CARD_ID, faceUp: true });
  });

  it("still places itself when the controller has no security cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-013", as: "vb" }],
          hand: [{ card: CARD_ID, as: "option" }],
        },
        1: { security: ["BT1-101"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 2;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.at(-1)?.cardId === CARD_ID, 160);

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security.at(-1)).toMatchObject({ cardId: CARD_ID, faceUp: true });
  });

  it("enforces Use Requirement when no VB card is present", async () => {
    const s = setupEngine({ 0: { hand: [{ card: CARD_ID, as: "option" }] } });
    s.state.memory = 2;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("option").instanceId)).toBe(true);
  });

  it("is a color waiver, not a VB gate: a yellow non-VB Digimon alone still lets the option be used", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-049", as: "yellowNonVb" }],
          hand: [{ card: CARD_ID, as: "option" }],
          security: [{ card: "BT1-101", as: "bottom" }],
        },
        1: { security: ["BT1-101"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 2;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.at(-1)?.cardId === CARD_ID, 160);
    expect(s.state.players[0]!.security.at(-1)).toMatchObject({ cardId: CARD_ID, faceUp: true });
  });

  it("plays a same-level VB Digimon from hand from its face-up security effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-013", as: "attacker" }],
          hand: [{ card: "EX12-013", as: "target" }],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
        },
        1: { security: ["BT1-101"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 2;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2, 160);

    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === s.inst("target").instanceId),
    ).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("orders its watcher with the attacker's [When Attacking] effects on a declared attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-032", as: "attacker", under: ["EX12-024", "EX12-024"] }],
          hand: [{ card: "EX12-016", as: "sameLevel" }],
          trash: [{ card: "EX12-035", as: "garurumon" }],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
        },
        1: { security: ["BT1-101"] },
      },
      { autoOrderTriggers: false },
    );
    await s.ready();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision !== undefined);

    expect(s.state.pendingDecision!.kind).toBe("orderTriggers");
    const options = s.decisions.at(-1)!.req.options as { triggerCardIds: string[] };
    expect(options.triggerCardIds).toContain(CARD_ID);
    expect(options.triggerCardIds).toContain("EX12-032");
  });

  it("orders its watcher with the pending When Digivolving and When Attacking effects of an effect-driven attack (Discord bug 1554515045856182272)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-013", as: "source", under: ["EX12-001"] },
            { card: "EX12-024", as: "partner" },
          ],
          hand: [
            { card: "EX12-032", as: "wereGarurumon", faceUp: false },
            { card: "EX12-016", as: "sameLevel", faceUp: false },
          ],
          trash: [{ card: "EX12-035", as: "garurumon" }],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
          deck: Array(20).fill("EX12-005"),
        },
        1: { security: ["BT1-101"], deck: Array(20).fill("EX12-005") },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: false },
    );
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");

    const options = s.decisions.at(-1)!.req.options as { triggerCardIds: string[]; triggerKeys: string[] };
    expect(options.triggerCardIds.slice().sort()).toEqual(["EX12-024", "EX12-032", "EX12-032", CARD_ID]);
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID)).toBe(false);

    const virusBustersResolved = () =>
      s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === CARD_ID);
    while (!virusBustersResolved()) {
      const pending = s.state.pendingDecision!;
      expect(pending.kind).toBe("orderTriggers");
      const offered = s.decisions.at(-1)!.req.options as { triggerCardIds: string[]; triggerKeys: string[] };
      const nextIndex = offered.triggerCardIds.findIndex((cardId) => cardId !== CARD_ID);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: { kind: "orderTriggers", order: [offered.triggerKeys[Math.max(nextIndex, 0)]!] },
        }),
      ).toEqual({ ok: true });
      await settle(() => virusBustersResolved() || s.state.pendingDecision?.kind === "orderTriggers");
    }

    const resolvedOrder = s.events.flatMap((event) =>
      event.kind === "effectResolved" && (event.sourceCardId === CARD_ID || event.sourceCardId === "EX12-032")
        ? [event.sourceCardId]
        : [],
    );
    expect(resolvedOrder.at(-1)).toBe(CARD_ID);
    expect(resolvedOrder.filter((cardId) => cardId === "EX12-032")).toHaveLength(2);

    expect(s.engine.applyIntent(s.state.turnSeat, { type: "surrender" })).toEqual({ ok: true });
    await turn;
  });

  it("reads the attacker's runtime traits, not only its printed ones", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-051", as: "attacker" }],
          hand: [{ card: "EX12-013", as: "target" }],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
        },
        1: { security: ["BT1-101"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 2;
    advance(s.engine).ledgers.continuous.addNameTraitGrant(
      s.perm("attacker").permanentId,
      "trait",
      ["VB"],
      EffectDuration.Permanent,
    );

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2, 160);

    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === s.inst("target").instanceId),
    ).toBe(true);
  });

  it("does not play a different-level VB Digimon from the face-up security watcher", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-013", as: "attacker" }],
          hand: [{ card: "EX12-017", as: "differentLevel" }],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("differentLevel").instanceId);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("plays a level-5-or-lower VB Digimon from hand when its security skill resolves", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX12-016", as: "target" },
            { card: "EX12-017", as: "tooHigh" },
          ],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
        },
        1: { security: ["BT1-101"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("security"));
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === s.inst("target").instanceId),
    );

    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === s.inst("target").instanceId),
    ).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("tooHigh").instanceId)).toBe(true);
    expect(s.state.players[0]!.security.some((card) => card.instanceId === s.inst("security").instanceId)).toBe(true);
  });

  it("does not play a qualifying VB Digimon from trash", async () => {
    const s = setupEngine(
      {
        0: {
          trash: [{ card: "EX12-013", as: "trashTarget" }],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("security"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "EX12-013")).toBe(false);
    expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("trashTarget").instanceId)).toBe(
      true,
    );
  });

  it("matches the complete catalog identity", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      nameEn: "Virus Busters",
      colors: ["Yellow"],
      kinds: ["Option"],
      playCost: 2,
      dp: 0,
      evoCosts: [],
      types: ["VB"],
      securityEffectText:
        "[Security] You may play 1 level 5 or lower [VB] trait Digimon card from your hand without paying the cost.",
    });
  });
});

describe("EX12-069 Virus Busters — KB Q&A rulings", () => {
  const option: FaceUpSecurityOption = {
    cardId: CARD_ID,
    useRequirementCard: "EX12-013",
    securityPlayCard: "EX12-016",
  };

  it("can be used with 0 security cards and only places itself face up (Q6876)", async () => {
    await expectUseWithEmptySecurity(option);
  });

  it("stays revealed as a face-up security card that otherwise counts as a normal one (Q6877)", async () => {
    await expectFaceUpSecurityStaysRevealed(option);
  });

  it("is checked while left revealed and otherwise resolves like a standard check (Q6878)", async () => {
    await expectFaceUpSecurityCheckedLikeStandard(option);
  });

  it("triggers its [Security] effect when checked face up (Q6879)", async () => {
    await expectFaceUpSecurityEffectTriggers(option);
  });

  it("turns face down when its security stack is shuffled and stays face down (Q6880)", async () => {
    await expectShuffleTurnsFaceUpSecurityDown(option);
  });
  async function attackWithAngewomonDigivolvingFirst(digivolveInto: string) {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-044", as: "attacker", under: ["BT1-051", "BT1-052"] }],
          hand: [
            { card: digivolveInto, as: "digivolveTarget" },
            { card: "EX12-035", as: "levelSix" },
            { card: "EX12-016", as: "levelFive" },
          ],
          deck: ["BT1-009"],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
        },
        1: { deck: ["BT1-012"], security: ["BT1-101"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferTriggerKeys: ["EX12-044"],
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.inst("digivolveTarget").instanceId, s.inst("levelSix").instanceId);
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2, 200);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("attacker").topCard.instanceId).toBe(s.inst("digivolveTarget").instanceId);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toContain(
      s.inst("levelSix").instanceId,
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("levelFive").instanceId);
    expect(s.state.memory).toBe(0);
    return s;
  }

  it("still activates after the attacker loses the [VB] trait and reads its current level (Q6881)", async () => {
    const s = await attackWithAngewomonDigivolvingFirst("BT1-063");

    expect(getCardDefinition(s.perm("attacker").topCard.cardId)?.types).not.toContain("VB");
    expect(getCardDefinition(s.perm("attacker").topCard.cardId)?.level).toBe(6);
  });

  it("plays a level 6 card after the level 5 attacker digivolves to level 6 before it resolves (Q6882)", async () => {
    const s = await attackWithAngewomonDigivolvingFirst("EX12-017");

    expect(getCardDefinition(s.perm("attacker").topCard.cardId)).toMatchObject({
      level: 6,
      types: expect.arrayContaining(["VB"]),
    });
  });
});
