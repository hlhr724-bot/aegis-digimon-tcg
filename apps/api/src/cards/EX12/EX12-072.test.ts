import { compiledEffects, EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { compiled } from "./EX12-072.js";
import {
  expectFaceUpSecurityCheckedLikeStandard,
  expectFaceUpSecurityEffectTriggers,
  expectFaceUpSecurityStaysRevealed,
  expectShuffleTurnsFaceUpSecurityDown,
  expectUseWithEmptySecurity,
  type FaceUpSecurityOption,
} from "./faceUpSecurityOption.testSupport.js";
import "../index.js";

const CARD_ID = "EX12-072";

describe("EX12-072 Metal Empire", () => {
  it("maps Use Req, face-up security Guard, bottom exchange, and Security play", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.find((effect) => effect.trigger === "Static")?.actions[0]).toMatchObject({
      kind: "WaiveColorRequirement",
      condition: {
        kind: "youHave",
        filter: { kind: ["Digimon", "Tamer"], nameOrTrait: [{ tokens: ["ME"], match: "trait" }] },
      },
    });
    expect(compiled.effects.find((effect) => effect.trigger === "AllTurns" && effect.isSecurity)).toMatchObject({
      actions: [
        {
          kind: "Aura",
          target: {
            filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["ME"], match: "trait" }] },
            count: "all",
          },
          effect: { kind: "keyword", keyword: { keyword: "Guard" } },
        },
      ],
    });
    expect(compiled.effects.some((effect) => effect.actions.some((action) => action.kind === "Replacement"))).toBe(
      false,
    );
    expect(compiled.effects.find((effect) => effect.trigger === "Main")?.actions).toEqual([
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
    expect(compiled.effects.find((effect) => effect.trigger === "Security" && effect.isSecurity)).toMatchObject({
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
    expect(compiledEffects[CARD_ID]).toBeDefined();
    expect(compiledEffects[CARD_ID]).toEqual(compiled);
  });

  const primitivesOf = (engine: unknown) =>
    (engine as { primitives: { deletePermanent(ids: string[], cause: string): Promise<number> } }).primitives;

  it("uses the granted Guard to prevent an opponent-effect deletion, paying with an ME Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-008", as: "me" },
            { card: "EX12-005", as: "other" },
          ],
          security: [{ card: CARD_ID, as: "metal", faceUp: true }],
        },
        1: {},
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const protectedId = s.perm("other").permanentId;
    const guardId = s.perm("me").permanentId;

    await primitivesOf(s.engine).deletePermanent([protectedId], "byEffect");
    await settle(() => false, 30);

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === protectedId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === guardId)).toBe(false);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("EX12-008");
  });

  it("names the Digimon using granted Guard in the prevention decision", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX12-008", as: "guard" },
          { card: "EX12-064", as: "protected" },
        ],
        security: [{ card: CARD_ID, as: "metal", faceUp: true }],
      },
      1: {},
    });
    s.state.turnSeat = 1;
    await s.ready();

    const deletion = primitivesOf(s.engine).deletePermanent([s.perm("protected").permanentId], "byEffect");
    await settle(() => s.state.pendingDecision?.kind === "optional");

    const request = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision?.decisionId)?.req;
    expect(request).toMatchObject({
      sourceCardId: "EX12-008",
      sourceInstanceId: s.inst("guard").instanceId,
      options: { effectText: "＜Guard＞: you may delete this Digimon to prevent your other Digimon from leaving." },
    });

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await deletion;
  });

  it("does not protect while the security card is face-down", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-008", as: "me" },
            { card: "EX12-005", as: "other" },
          ],
          security: [{ card: CARD_ID, as: "metal", faceUp: false }],
        },
        1: {},
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const protectedId = s.perm("other").permanentId;

    await primitivesOf(s.engine).deletePermanent([protectedId], "byEffect");
    await settle(() => false, 30);

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === protectedId)).toBe(false);
  });

  it("cannot pay the Guard cost without an ME Digimon, so the deletion resolves", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-005", as: "other" }],
          security: [{ card: CARD_ID, as: "metal", faceUp: true }],
        },
        1: {},
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const protectedId = s.perm("other").permanentId;

    await primitivesOf(s.engine).deletePermanent([protectedId], "byEffect");
    await settle(() => false, 30);

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === protectedId)).toBe(false);
  });

  it("does not prevent a deletion caused by the controller's own effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-008", as: "me" },
            { card: "EX12-005", as: "other" },
          ],
          security: [{ card: CARD_ID, as: "metal", faceUp: true }],
        },
        1: {},
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    await s.ready();
    const protectedId = s.perm("other").permanentId;

    await primitivesOf(s.engine).deletePermanent([protectedId], "byEffect");
    await settle(() => false, 30);

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === protectedId)).toBe(false);
  });

  it("returns the bottom security card and places itself face-up at the bottom", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-008", as: "me" }],
          hand: [{ card: CARD_ID, as: "option" }],
          security: ["BT1-101", "BT1-102"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const optionInstanceId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionInstanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.at(-1)?.instanceId === optionInstanceId);

    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-102")).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[0]!.security.at(-1)).toMatchObject({ cardId: CARD_ID, faceUp: true });
  });

  it("places itself when the controller has no security cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-008", as: "me" }],
          hand: [{ card: CARD_ID, as: "option" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const optionInstanceId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionInstanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.at(-1)?.instanceId === optionInstanceId);

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security.at(-1)).toMatchObject({ cardId: CARD_ID, faceUp: true });
  });

  it("enforces Use Requirement when no ME card is present", async () => {
    const s = setupEngine({ 0: { hand: [{ card: CARD_ID, as: "option" }] } });
    s.state.memory = 2;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("option").instanceId);
  });

  it("plays a level-5-or-lower ME Digimon from hand when its Security effect resolves", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "EX12-016", as: "target" },
            { card: "EX12-017", as: "tooHigh" },
          ],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
        },
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
  });

  it("does not play a qualifying ME Digimon from the trash", async () => {
    const s = setupEngine(
      {
        0: {
          trash: [{ card: "EX12-010", as: "trashTarget" }],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
          deck: ["EX12-008", "EX12-008", "EX12-008"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("security"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX12-010")).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("trashTarget").instanceId)).toBe(true);
  });

  it("activates its Security effect when checked while already face-up", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-008", as: "attacker" }] },
        1: {
          hand: [{ card: "EX12-008", as: "target" }],
          security: [{ card: CARD_ID, as: "security", faceUp: true }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.some(({ topCard }) => topCard?.cardId === "EX12-008"));

    expect(
      s.state.players[1]!.battleArea.some(({ topCard }) => topCard?.instanceId === s.inst("target").instanceId),
    ).toBe(true);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("security").instanceId);
  });

  it("is not enabled by a resident Option carrying the Use Req. trait", () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX12-073", as: "residentOption" }],
        hand: [{ card: CARD_ID, as: "useReqOption" }],
      },
    });
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("useReqOption").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });
  });

  it("matches the complete catalog identity", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      nameEn: "Metal Empire",
      colors: ["Black"],
      kinds: ["Option"],
      playCost: 2,
      dp: 0,
      evoCosts: [],
      types: ["ME"],
      securityEffectText:
        "[Security] You may play 1 level 5 or lower [ME] trait Digimon card from your hand without paying the cost.",
    });
  });
});

describe("EX12-072 Metal Empire — KB Q&A rulings", () => {
  const option: FaceUpSecurityOption = {
    cardId: CARD_ID,
    useRequirementCard: "EX12-016",
    securityPlayCard: "EX12-016",
  };

  it("can be used with 0 security cards and only places itself face up (Q6887)", async () => {
    await expectUseWithEmptySecurity(option);
  });

  it("stays revealed as a face-up security card that otherwise counts as a normal one (Q6888)", async () => {
    await expectFaceUpSecurityStaysRevealed(option);
  });

  it("is checked while left revealed and otherwise resolves like a standard check (Q6889)", async () => {
    await expectFaceUpSecurityCheckedLikeStandard(option);
  });

  it("triggers its [Security] effect when checked face up (Q6890)", async () => {
    await expectFaceUpSecurityEffectTriggers(option);
  });

  it("turns face down when its security stack is shuffled and stays face down (Q6891)", async () => {
    await expectShuffleTurnsFaceUpSecurityDown(option);
  });
});
