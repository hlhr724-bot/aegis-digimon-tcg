import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { compiled } from "./EX13-013.js";

const CARD_ID = "EX13-013";

const LV4_RED = "BT1-014";
const LV3_RED = "BT1-009";
const LV5_BLUE = "BT1-038";
const BODY = "BT1-013";
const SECOND_SECURITY = "BT1-010";
const GALLANTMON = "BT2-020";
const FLARE = "BT2-091";

const GUILMON_TAMER = "BT17-080";
const PLAIN_TAMER = "BT12-088";
const GUILMON_DIGIMON = "EX13-007";

describe("EX13-013 WarGrowlmon", () => {
  it.each(["EX13-013", "EX12-019", "EX12-060"])(
    "%s identifies Engage and its rules text in the end-turn prompt",
    async (cardId) => {
      const s = setupEngine({
        0: { battleArea: [{ card: cardId, as: "engage" }], deck: [LV3_RED, LV3_RED], security: [LV3_RED] },
        1: { deck: [LV3_RED, LV3_RED], security: [LV3_RED] },
      });
      await s.ready();
      s.state.memory = 3;
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(0);
      advance(s.engine).endMainPhaseIfOpen(0);
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const request = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision!.decisionId)!.req;
      expect(request.options).toMatchObject({
        effectText: "＜Engage＞: at the end of this turn, this Digimon may attack.",
        activationConfirmation: true,
      });
      const engageAnnouncements = () =>
        s.events.filter(
          (event) => event.kind === "effectTriggered" && event.sourceCardId === cardId && event.timing === "OnEndTurn",
        );
      expect(engageAnnouncements()).toHaveLength(0);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      await turn;
      expect(engageAnnouncements()).toHaveLength(0);
      expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(0);
    },
  );

  it("announces Engage only after its end-turn attack is accepted", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: CARD_ID, as: "engage" }], deck: [LV3_RED, LV3_RED], security: [LV3_RED] },
      1: { deck: [LV3_RED, LV3_RED], security: [LV3_RED, LV3_RED] },
    });
    await s.ready();
    s.state.memory = 3;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decisionId = s.state.pendingDecision!.decisionId;
    const eventsBeforeAccept = s.events.length;
    expect(
      s.events.some(
        (event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID && event.timing === "OnEndTurn",
      ),
    ).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "selectCards", instanceIds: ["player"] },
      }),
    ).toEqual({ ok: true });
    await turn;
    const sequence = s.events
      .slice(eventsBeforeAccept)
      .filter(
        (event) =>
          (event.kind === "effectTriggered" && event.sourceCardId === CARD_ID && event.timing === "OnEndTurn") ||
          event.kind === "attackDeclared",
      )
      .map((event) => event.kind);
    expect(sequence).toEqual(["effectTriggered", "attackDeclared"]);
    expect(
      s.events.find(
        (event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID && event.timing === "OnEndTurn",
      ),
    ).toMatchObject({ description: "＜Engage＞: at the end of this turn, this Digimon may attack." });
  });

  it("matches the catalog printing", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      cardId: CARD_ID,
      nameEn: "WarGrowlmon",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 8,
      dp: 8000,
      forms: ["Ultimate"],
      attributes: ["Virus"],
      types: ["Cyborg"],
      evoCosts: [{ color: "Red", level: 4, memoryCost: 3 }],
      effectText:
        "＜Engage＞ \n[When Digivolving] [When Attacking] Delete 1 of your opponent's Digimon with 5000 DP or less. If this effect didn't delete, this Digimon gains ＜Piercing＞ and +3000 DP for the turn.\n[End of Attack] [On Deletion] You may play 1 Tamer card with [Guilmon] in its text from your hand or trash without paying the cost.",
      inheritedEffectText:
        "[All Turns] [Once Per Turn] When any of your opponent's Digimon are deleted, if this Digimon has [Gallantmon] in its name, trash their top security card.",
    });
  });

  it("compiles every printed clause and nothing else", () => {
    expect(runtimeCompiledCard(CARD_ID)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual([
      "Static",
      "EndOfYourTurn",
      "WhenDigivolving",
      "WhenAttacking",
      "EndOfAttack",
      "OnDeletion",
      "AllTurns",
    ]);

    expect(compiled.effects[0]).toMatchObject({ keywords: [{ keyword: "Engage", raw: "＜Engage＞" }], actions: [] });
    expect(compiled.effects[1]).toMatchObject({
      actions: [{ kind: "Attack", target: { filter: { isSelfRef: true }, count: 1, isSelf: true }, optional: true }],
    });

    for (const trigger of ["WhenDigivolving", "WhenAttacking"] as const) {
      const effect = compiled.effects.find((candidate) => candidate.trigger === trigger)!;
      expect(effect.isInherited).toBeUndefined();
      expect(effect.frequency).toBeUndefined();
      expect(effect.sharedUseKey).toBeUndefined();
      expect(effect.actions).toMatchObject([
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 5000 } }, count: 1 },
        },
        {
          kind: "GainKeyword",
          keyword: { keyword: "Piercing" },
          duration: "forTheTurn",
          condition: { kind: "ifThisEffectDidNotDelete" },
        },
        { kind: "ModifyDP", amount: 3000, duration: "forTheTurn", condition: { kind: "ifThisEffectDidNotDelete" } },
      ]);
      expect(effect.actions[0]).not.toHaveProperty("optional");
    }

    for (const trigger of ["EndOfAttack", "OnDeletion"] as const) {
      expect(compiled.effects.find((candidate) => candidate.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "PlayWithoutCost",
            target: {
              filter: { controller: "mine", kind: ["Tamer"], nameOrTrait: [{ tokens: ["Guilmon"], match: "text" }] },
              count: 1,
            },
            from: ["hand", "trash"],
            payCost: false,
            optional: true,
          },
        ],
      });
    }

    expect(compiled.effects[6]).toMatchObject({
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: { controller: "opponent", kind: ["Digimon"] },
          actions: [
            {
              kind: "SecurityManipulation",
              op: "trashTop",
              controller: "opponent",
              condition: { kind: "selfHasNameContaining", names: ["Gallantmon"] },
            },
          ],
        },
      ],
    });
  });

  it("digivolves from a Red Lv.4 source for 3 memory and deletes a 5000 DP Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: LV4_RED, as: "source" }],
          hand: [{ card: CARD_ID, as: "war" }],
          deck: [{ card: LV3_RED, as: "drawn" }],
          security: [LV3_RED],
        },
        1: {
          battleArea: [{ card: BODY, as: "victim", dp: 5000 }],
          security: [LV3_RED, SECOND_SECURITY],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const victimId = s.perm("victim").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("war").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    const war = s.perm("war");
    expect(war.topCard?.cardId).toBe(CARD_ID);
    expect(war.stack.map((card) => card.cardId)).toEqual([LV4_RED]);
    expect(war.currentDP).toBe(8000);
    expect(observe(s.engine).hasPierce(war)).toBe(false);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === victimId)).toBe(false);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([s.inst("victim").instanceId]);
    expect(s.state.memory).toBe(7);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[1]!.security.map((card) => card.cardId)).toEqual([LV3_RED, SECOND_SECURITY]);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("refuses a Red Lv.3 source and a Blue Lv.5 source", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: LV3_RED, as: "lv3" },
          { card: LV5_BLUE, as: "blue" },
        ],
        hand: [
          { card: CARD_ID, as: "warA" },
          { card: CARD_ID, as: "warB" },
        ],
        deck: [LV3_RED],
        security: [LV3_RED],
      },
      1: { security: [LV3_RED] },
    });
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("lv3").permanentId,
        instanceId: s.inst("warA").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("blue").permanentId,
        instanceId: s.inst("warB").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(10);
    expect(s.state.players[0]!.hand).toHaveLength(2);
    expect(s.state.players[0]!.deck).toHaveLength(1);
  });

  it("takes the Piercing / +3000 DP branch when the opponent's Digimon is over 5000 DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: LV4_RED, as: "source" }],
          hand: [{ card: CARD_ID, as: "war" }],
          deck: [{ card: LV3_RED, as: "drawn" }],
          security: [LV3_RED],
        },
        1: {
          battleArea: [{ card: BODY, as: "survivor", dp: 6000 }],
          security: [LV3_RED, SECOND_SECURITY],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("war").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.cardId === CARD_ID && permanent.currentDP === 11_000,
      ),
    );

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("survivor").currentDP).toBe(6000);
    expect(s.perm("war").currentDP).toBe(11000);
    expect(observe(s.engine).hasPierce(s.perm("war"))).toBe(true);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.state.memory).toBe(7);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("takes the Piercing / +3000 DP branch when the mandatory deletion is prevented (Q7239)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: LV4_RED, as: "source" }],
          hand: [{ card: CARD_ID, as: "war" }],
          deck: [LV3_RED],
        },
        1: {
          battleArea: [{ card: "BT18-036", as: "protected", under: ["BT19-029"], dp: 5000 }],
          security: [{ card: LV3_RED, as: "preventionCost" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("war").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.cardId === CARD_ID && observe(s.engine).hasPierce(permanent),
      ),
    );

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("protected").permanentId,
    ]);
    expect(s.perm("war").currentDP).toBe(11_000);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("preventionCost").instanceId,
    ]);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("deletes a 5000 DP Digimon when it attacks and then plays a [Guilmon] Tamer from hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "war" }],
          hand: [{ card: GUILMON_TAMER, as: "takato" }],
          deck: [LV3_RED],
          security: [LV3_RED],
        },
        1: {
          battleArea: [{ card: BODY, as: "victim", dp: 5000 }],
          security: [
            { card: LV3_RED, as: "topSecurity" },
            { card: SECOND_SECURITY, as: "bottomSecurity" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("war").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("victim").instanceId);
    expect(s.perm("war").currentDP).toBe(8000);
    expect(observe(s.engine).hasPierce(s.perm("war"))).toBe(false);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([s.inst("bottomSecurity").instanceId]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("topSecurity").instanceId);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId).sort()).toEqual(
      [CARD_ID, GUILMON_TAMER].sort(),
    );
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.memory).toBe(3);
    expect(s.perm("war").isSuspended).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("plays only the Tamer whose text carries [Guilmon], not the Guilmon Digimon or a plain Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "war" }],
          hand: [
            { card: GUILMON_DIGIMON, as: "guilmonDigimon" },
            { card: PLAIN_TAMER, as: "takuya" },
            { card: GUILMON_TAMER, as: "takato" },
          ],
          deck: [LV3_RED],
          security: [LV3_RED],
        },
        1: { security: [{ card: LV3_RED, as: "topSecurity" }, SECOND_SECURITY] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("war").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && !observe(s.engine).isAttacking());

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.instanceId).sort()).toEqual(
      [s.perm("war").topCard!.instanceId, s.inst("takato").instanceId].sort(),
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId).sort()).toEqual(
      [s.inst("guilmonDigimon").instanceId, s.inst("takuya").instanceId].sort(),
    );
    expect(s.perm("war").currentDP).toBe(11000);
    expect(observe(s.engine).hasPierce(s.perm("war"))).toBe(true);
    expect(s.state.memory).toBe(3);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each([
    { tamer: "EX2-056", shouldPlay: false },
    { tamer: GUILMON_TAMER, shouldPlay: true },
  ])("checks Guilmon text on $tamer after being deleted by a security battle", async ({ tamer, shouldPlay }) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "war", under: ["EX13-007", "EX13-010"] }],
          hand: [{ card: tamer, as: "takato" }],
          trash: [GUILMON_DIGIMON],
          deck: [LV3_RED],
        },
        1: { security: ["BT13-056"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("war").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[0]!.trash.some((card) => card.cardId === CARD_ID)).toBe(true);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(
      shouldPlay ? [tamer] : [],
    );
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(shouldPlay ? [] : [tamer]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("plays one [Guilmon] Tamer from the trash when it is deleted defending on the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "war", suspended: true }],
          trash: [
            { card: GUILMON_TAMER, as: "firstTakato" },
            { card: GUILMON_TAMER, as: "secondTakato" },
          ],
          deck: [LV3_RED],
          security: [LV3_RED],
        },
        1: {
          battleArea: [{ card: BODY, as: "bruiser", dp: 20_000 }],
          hand: [{ card: LV3_RED, as: "spare" }],
          deck: [LV3_RED, LV3_RED],
          security: [LV3_RED],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();

    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    const memoryBeforeDeletion = s.state.memory;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("bruiser").permanentId,
        target: { kind: "permanent", permanentId: s.perm("war").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === GUILMON_TAMER));
    await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking());

    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("war").instanceId);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual([GUILMON_TAMER]);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId === GUILMON_TAMER)).toHaveLength(1);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual([BODY]);
    expect(s.state.memory).toBe(memoryBeforeDeletion);
    expect(s.state.pendingDecision).toBeUndefined();
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
  });

  it("attacks at the end of its controller's turn through Engage, and the +3000 DP expires with the turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "war" }],
          hand: [{ card: PLAIN_TAMER, as: "spare" }],
          deck: [LV3_RED, LV3_RED],
          security: [LV3_RED],
        },
        1: {
          security: [
            { card: LV3_RED, as: "topSecurity" },
            { card: SECOND_SECURITY, as: "bottomSecurity" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("war"), "Engage")).toBe(true);

    await advance(s.engine).runTurn(0);

    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([s.inst("bottomSecurity").instanceId]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("topSecurity").instanceId);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.perm("war").isSuspended).toBe(true);
    expect(s.perm("war").currentDP).toBe(8000);
    expect(observe(s.engine).hasPierce(s.perm("war"))).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("trashes the opponent's top security card once per turn under a [Gallantmon] host", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: GALLANTMON, as: "host", under: [{ card: CARD_ID, as: "inherited" }] }],
          hand: [
            { card: FLARE, as: "firstFlare" },
            { card: FLARE, as: "secondFlare" },
          ],
          deck: [LV3_RED],
          security: [LV3_RED],
        },
        1: {
          battleArea: [
            { card: BODY, as: "firstVictim", dp: 4000 },
            { card: BODY, as: "secondVictim", dp: 4000 },
          ],
          security: [
            { card: LV3_RED, as: "topSecurity" },
            { card: SECOND_SECURITY, as: "middleSecurity" },
            { card: LV3_RED, as: "bottomSecurity" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual([CARD_ID]);

    s.decisions.length = 0;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstFlare").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === 2);

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("middleSecurity").instanceId,
      s.inst("bottomSecurity").instanceId,
    ]);
    expect(s.state.players[1]!.security.every((card) => card.faceUp === false)).toBe(true);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("topSecurity").instanceId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondFlare").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("middleSecurity").instanceId,
      s.inst("bottomSecurity").instanceId,
    ]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("resets the inherited [Once Per Turn] on its controller's next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: GALLANTMON, as: "host", under: [{ card: CARD_ID, as: "inherited" }] }],
          hand: [
            { card: FLARE, as: "firstFlare" },
            { card: FLARE, as: "secondFlare" },
          ],
          deck: [LV3_RED, LV3_RED, LV3_RED],
          security: [LV3_RED],
        },
        1: {
          battleArea: [
            { card: BODY, as: "firstVictim", dp: 4000 },
            { card: BODY, as: "secondVictim", dp: 4000 },
          ],
          security: [
            { card: LV3_RED, as: "topSecurity" },
            { card: SECOND_SECURITY, as: "middleSecurity" },
            { card: LV3_RED, as: "bottomSecurity" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstFlare").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === 2);
    expect(s.state.players[1]!.security).toHaveLength(2);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const ownerTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondFlare").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === 1);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([s.inst("bottomSecurity").instanceId]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("middleSecurity").instanceId);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownerTurn;
  });

  it("does nothing under a host without [Gallantmon] in its name", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: LV4_RED, as: "host", under: [{ card: CARD_ID, as: "inherited" }] }],
          hand: [{ card: FLARE, as: "flare" }],
          deck: [LV3_RED],
          security: [LV3_RED],
        },
        1: {
          battleArea: [{ card: BODY, as: "victim", dp: 4000 }],
          security: [
            { card: LV3_RED, as: "topSecurity" },
            { card: SECOND_SECURITY, as: "bottomSecurity" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("flare").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("topSecurity").instanceId,
      s.inst("bottomSecurity").instanceId,
    ]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([s.inst("victim").instanceId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("EX13-013 WarGrowlmon — KB Q&A rulings", () => {
  it("must delete an available 5000 DP Digimon, so declining to pick cannot claim Piercing and +3000 DP (Q7238)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: LV4_RED, as: "source" }],
          hand: [{ card: CARD_ID, as: "war" }],
          deck: [LV3_RED],
        },
        1: {
          battleArea: [
            { card: BODY, as: "first", dp: 5000 },
            { card: BODY, as: "second", dp: 2000 },
          ],
          security: [LV3_RED],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("war").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.decisions.find(({ req }) => req.kind === "chooseTargets")?.req.options?.min).toBe(1);
    expect(s.state.players[1]!.trash).toHaveLength(1);
    expect(s.perm("war").currentDP).toBe(8000);
    expect(observe(s.engine).hasPierce(s.perm("war"))).toBe(false);
  });

  it("offers every Tamer carrying [Guilmon] anywhere in its text, and no Tamer without it (Q7240)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "war" }],
          hand: [
            { card: PLAIN_TAMER, as: "takuya" },
            { card: GUILMON_TAMER, as: "takato" },
            { card: "EX13-068", as: "otherTakato" },
          ],
          deck: [LV3_RED],
          security: [LV3_RED],
        },
        1: { security: [LV3_RED, SECOND_SECURITY] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("war").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && !observe(s.engine).isAttacking());
    await settle(() => s.state.pendingDecision === undefined);

    const pick = s.decisions.find(({ req }) =>
      req.options?.candidateInstanceIds?.includes(s.inst("takato").instanceId),
    );
    expect(pick?.req.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.inst("takato").instanceId, s.inst("otherTakato").instanceId]),
    );
    expect(pick?.req.options?.candidateInstanceIds).not.toContain(s.inst("takuya").instanceId);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("takuya").instanceId);
  });
});
