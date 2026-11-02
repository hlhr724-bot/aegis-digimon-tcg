import { CARD_ID_VIEW_TAG, EffectTiming, getCardDefinition } from "@aegis/shared";
import { Encoder } from "@colyseus/schema";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { buildStateView } from "../../engine/state/visibility.js";
import "../index.js";
import { compiled } from "./EX13-026.js";

const CARD_ID = "EX13-026";

const HOLY_BEAST = "BT1-050";
const ROYAL_KNIGHT = "BT1-084";
const DATA_SQUAD = "BT26-065";
const NEAR_BEAST = "BT1-049";
const NEAR_KNIGHT = "BT11-033";
const NON_MATCH = "BT1-009";

const DATA_SQUAD_TAMER = "BT25-087";
const OTHER_TAMER = "BT1-087";

async function attackWindow(s: ReturnType<typeof setupEngine>, alias: string): Promise<void> {
  await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm(alias), {
    attackerPermanentId: s.perm(alias).permanentId,
  });
}

describe("EX13-026 Kudamon", () => {
  it("matches the catalog printed text, stats and evolution costs", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      cardId: CARD_ID,
      nameEn: "Kudamon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      forms: ["Rookie"],
      attributes: ["Vaccine"],
      types: ["Holy Beast", "DATA SQUAD"],
      evoCosts: [{ color: "Yellow", level: 2, memoryCost: 0 }],
      effectText:
        "[Digivolve] Lv.2 w/[DATA SQUAD] trait: Cost 0 \n\n[When Moving] [On Play] Reveal the top 3 cards of your deck. Among them, add 1 [Holy Beast], [Royal Knight] or [DATA SQUAD] trait card to the hand and place 1 such card face down under any of your [DATA SQUAD] trait Tamers. Return the rest to the bottom of the deck.",
      inheritedEffectText:
        "[When Attacking] [Once Per Turn] Give 1 of your opponent's Digimon ＜Security A. -1＞ until their turn ends.",
    });
  });

  it("compiles every printed clause", () => {
    expect(runtimeCompiledCard(CARD_ID)).toMatchObject({ coverage: "full", residual: [] });

    expect(compiled.digivolutionRequirement).toEqual([
      { level: 2, traits: ["DATA SQUAD"], cost: 0, isAlternate: true },
    ]);

    const traitUnion = {
      controllerDefault: "mine",
      nameOrTrait: [{ tokens: ["Holy Beast", "Royal Knight", "DATA SQUAD"], match: "trait" }],
    };

    for (const trigger of ["WhenMoving", "OnPlay"]) {
      const effect = compiled.effects.find((candidate) => candidate.trigger === trigger)!;
      expect(effect.isInherited).toBeUndefined();
      expect(effect.frequency).toBeUndefined();
      expect(effect.actions).toEqual([
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "add 1 [Holy Beast], [Royal Knight] or [DATA SQUAD] trait card to the hand",
              filter: traitUnion,
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "place 1 such card face down under any of your [DATA SQUAD] trait Tamers.",
              filter: traitUnion,
              count: 1,
              to: "underTamer",
              faceDown: true,
              underFilter: {
                controller: "mine",
                kind: ["Tamer"],
                nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }],
              },
              requiresMinRevealed: 2,
            },
          ],
          rest: "deckBottom",
        },
      ]);
    }

    const inherited = compiled.effects.find((effect) => effect.isInherited)!;
    expect(inherited).toEqual({
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "GainKeyword",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          keyword: { keyword: "SecurityAttack", amount: -1, raw: "＜Security A. -1＞" },
          duration: "untilOpponentTurnEnd",
        },
      ],
    });
  });

  it("digivolves from an off-colour [DATA SQUAD] egg for 0 and keeps the egg in the stack", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT25-002", as: "wanyamon" },
        hand: [{ card: CARD_ID, as: "kudamon" }],
        deck: [{ card: NON_MATCH, as: "bonusDraw" }],
      },
    });
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("wanyamon").permanentId,
        instanceId: s.inst("kudamon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("wanyamon").topCard.cardId === CARD_ID);

    expect(s.state.memory).toBe(0);
    expect(s.perm("wanyamon").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("wanyamon").instanceId]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("bonusDraw").instanceId]);
    expect(s.state.players[0]!.deck).toHaveLength(0);
  });

  it("pins the alternate route by index for the [DATA SQUAD] egg and refuses a non-[DATA SQUAD] source on it", async () => {
    const legal = setupEngine({
      0: {
        breeding: { card: "BT25-002", as: "wanyamon" },
        hand: [{ card: CARD_ID, as: "kudamon" }],
        deck: [{ card: NON_MATCH, as: "bonusDraw" }],
      },
    });
    legal.state.memory = 0;
    await legal.ready();

    expect(
      legal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: legal.perm("wanyamon").permanentId,
        instanceId: legal.inst("kudamon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => legal.perm("wanyamon").topCard.cardId === CARD_ID);
    expect(legal.state.memory).toBe(0);
    expect(legal.perm("wanyamon").stack.map(({ instanceId }) => instanceId)).toEqual([
      legal.inst("wanyamon").instanceId,
    ]);

    const illegal = setupEngine({
      0: {
        breeding: { card: "BT1-005", as: "kyaromon" },
        hand: [{ card: CARD_ID, as: "kudamon" }],
        deck: [NON_MATCH],
      },
    });
    illegal.state.memory = 0;
    await illegal.ready();

    expect(
      illegal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: illegal.perm("kyaromon").permanentId,
        instanceId: illegal.inst("kudamon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(illegal.perm("kyaromon").topCard.cardId).toBe("BT1-005");
    expect(illegal.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      illegal.inst("kudamon").instanceId,
    ]);
    expect(illegal.state.memory).toBe(0);
  });

  it("refuses a Lv.2 egg that is neither yellow nor [DATA SQUAD] on either route", async () => {
    for (const useAlternateCost of [true, false]) {
      const s = setupEngine({
        0: {
          breeding: { card: "BT1-007", as: "tanemon" },
          hand: [{ card: CARD_ID, as: "kudamon" }],
          deck: [NON_MATCH],
        },
      });
      s.state.memory = 0;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("tanemon").permanentId,
          instanceId: s.inst("kudamon").instanceId,
          useAlternateCost,
        }),
      ).toEqual(expect.objectContaining({ ok: false }));
      expect(s.perm("tanemon").topCard.cardId).toBe("BT1-007");
      expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("kudamon").instanceId]);
      expect(s.state.memory).toBe(0);
    }
  });

  it("keeps the printed Yellow Lv.2 route available for a non-[DATA SQUAD] yellow egg", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT1-005", as: "kyaromon" },
        hand: [{ card: CARD_ID, as: "kudamon" }],
        deck: [{ card: NON_MATCH, as: "bonusDraw" }],
      },
    });
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("kyaromon").permanentId,
        instanceId: s.inst("kudamon").instanceId,
        useAlternateCost: false,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("kyaromon").topCard.cardId === CARD_ID);

    expect(s.state.memory).toBe(0);
    expect(s.perm("kyaromon").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("kyaromon").instanceId]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("bonusDraw").instanceId]);
  });

  it("Q7279/Q7280 saves at the immutable bottom of the [DATA SQUAD] Tamer's existing stack", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: DATA_SQUAD_TAMER,
              as: "tamer",
              under: [{ card: NON_MATCH, as: "existing", faceUp: false }],
            },
          ],
          hand: [{ card: CARD_ID, as: "kudamon" }],
          deck: [
            { card: HOLY_BEAST, as: "toHand" },
            { card: DATA_SQUAD, as: "toSave" },
            { card: NON_MATCH, as: "nonMatch" },
            { card: "BT1-012", as: "sentinel" },
          ],
          security: ["BT1-013"],
        },
        1: { security: ["BT1-014"], deck: ["BT1-013"] },
      },
      { autoSelectCards: true, autoOrderCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("toHand").instanceId);
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kudamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("tamer").stack.length === 2);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([DATA_SQUAD_TAMER, CARD_ID]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("toHand").instanceId]);
    const saved = s.perm("tamer").stack;
    expect(saved.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("toSave").instanceId,
      s.inst("existing").instanceId,
    ]);
    expect(saved.every(({ faceUp }) => faceUp === false)).toBe(true);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("sentinel").instanceId,
      s.inst("nonMatch").instanceId,
    ]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it("matches each printed trait token: [Holy Beast], [Royal Knight] and [DATA SQUAD]", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: DATA_SQUAD_TAMER, as: "tamer" }],
          hand: [{ card: CARD_ID, as: "kudamon" }],
          deck: [
            { card: ROYAL_KNIGHT, as: "royalKnight" },
            { card: DATA_SQUAD, as: "dataSquad" },
            { card: HOLY_BEAST, as: "holyBeast" },
            { card: "BT1-012", as: "sentinel" },
          ],
          security: ["BT1-013"],
        },
        1: { security: ["BT1-014"], deck: ["BT1-013"] },
      },
      { autoSelectCards: true, autoOrderCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("royalKnight").instanceId, s.inst("dataSquad").instanceId);
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kudamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("tamer").stack.length === 1);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("royalKnight").instanceId]);
    expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("dataSquad").instanceId]);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("sentinel").instanceId,
      s.inst("holyBeast").instanceId,
    ]);
    assertNoLoudGap(s);
  });

  it("Q7283/Q7284 adds the single applicable card to hand and saves no ineligible card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: DATA_SQUAD_TAMER, as: "tamer" }],
          hand: [{ card: CARD_ID, as: "kudamon" }],
          deck: [
            { card: HOLY_BEAST, as: "onlyMatch" },
            { card: NEAR_BEAST, as: "nearBeast" },
            { card: NON_MATCH, as: "nonMatch" },
            { card: "BT1-012", as: "sentinel" },
          ],
          security: ["BT1-013"],
        },
        1: { security: ["BT1-014"], deck: ["BT1-013"] },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kudamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some(({ cardId }) => cardId === HOLY_BEAST));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("onlyMatch").instanceId]);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("sentinel").instanceId,
      s.inst("nearBeast").instanceId,
      s.inst("nonMatch").instanceId,
    ]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("Q7281/Q7282 hides its face-down Tamer card from the opponent and trashes it face up", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX13-032", as: "chirinmon" },
            { card: DATA_SQUAD_TAMER, as: "tamer" },
          ],
          hand: [{ card: CARD_ID, as: "kudamon" }],
          deck: [
            { card: HOLY_BEAST, as: "toHand" },
            { card: DATA_SQUAD, as: "toSave" },
            { card: NON_MATCH, as: "nonMatch" },
            { card: "BT1-012", as: "sentinel" },
          ],
          security: [],
        },
        1: { security: ["BT1-014"], deck: ["BT1-013"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kudamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("tamer").stack.length === 1);
    expect(s.perm("tamer").stack[0]).toMatchObject({ instanceId: s.inst("toSave").instanceId, faceUp: false });
    const encoder = new Encoder(s.state);
    expect(encoder).toBeInstanceOf(Encoder);
    const savedCard = s.perm("tamer").stack[0]!;
    expect(buildStateView(s.state, 0).hasTag(savedCard, CARD_ID_VIEW_TAG)).toBe(true);
    expect(buildStateView(s.state, 1).hasTag(savedCard, CARD_ID_VIEW_TAG)).toBe(false);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("chirinmon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("toSave").instanceId));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("toSave").instanceId, faceUp: true }),
    );
    assertNoLoudGap(s);
  });

  it("refuses the near-miss [Beast] and [Beast Knight] traits and bottoms all three reveals", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: DATA_SQUAD_TAMER, as: "tamer" }],
          hand: [{ card: CARD_ID, as: "kudamon" }],
          deck: [
            { card: NEAR_BEAST, as: "nearBeast" },
            { card: NEAR_KNIGHT, as: "nearKnight" },
            { card: NON_MATCH, as: "nonMatch" },
            { card: "BT1-012", as: "sentinel" },
          ],
          security: ["BT1-013"],
        },
        1: { security: ["BT1-014"], deck: ["BT1-013"] },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kudamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === CARD_ID));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("sentinel").instanceId,
      s.inst("nearBeast").instanceId,
      s.inst("nearKnight").instanceId,
      s.inst("nonMatch").instanceId,
    ]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("GitHub #5159: skips an unavailable DATA SQUAD Tamer destination and bottoms that card", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: OTHER_TAMER, as: "otherTamer" }],
          hand: [{ card: CARD_ID, as: "kudamon" }],
          deck: [
            { card: HOLY_BEAST, as: "toHand" },
            { card: DATA_SQUAD, as: "unsaved" },
            { card: NON_MATCH, as: "nonMatch" },
            { card: "BT1-012", as: "sentinel" },
          ],
          security: ["BT1-013"],
        },
        1: { security: ["BT1-014"], deck: ["BT1-013"] },
      },
      { autoSelectCards: true, autoOrderCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("toHand").instanceId);
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kudamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some(({ cardId }) => cardId === HOLY_BEAST));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.decisions.filter(({ req }) => req.sourceCardId === CARD_ID && req.kind === "selectCards")).toHaveLength(1);
    expect(s.perm("otherTamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("toHand").instanceId]);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([
        s.inst("sentinel").instanceId,
        s.inst("unsaved").instanceId,
        s.inst("nonMatch").instanceId,
      ]),
    );
    expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("sentinel").instanceId);
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("picks the [DATA SQUAD] Tamer over a non-[DATA SQUAD] Tamer with no decision raised", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: OTHER_TAMER, as: "otherTamer" },
            { card: DATA_SQUAD_TAMER, as: "dataSquadTamer" },
          ],
          hand: [{ card: CARD_ID, as: "kudamon" }],
          deck: [
            { card: HOLY_BEAST, as: "toHand" },
            { card: ROYAL_KNIGHT, as: "toSave" },
            { card: NON_MATCH, as: "nonMatch" },
            { card: "BT1-012", as: "sentinel" },
          ],
          security: ["BT1-013"],
        },
        1: { security: ["BT1-014"], deck: ["BT1-013"] },
      },
      { autoSelectCards: true, autoOrderCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("toHand").instanceId);
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("kudamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("dataSquadTamer").stack.length === 1);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("dataSquadTamer").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("toSave").instanceId]);
    expect(s.perm("dataSquadTamer").stack[0]!.faceUp).toBe(false);
    expect(s.perm("otherTamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("toHand").instanceId]);
    assertNoLoudGap(s);
  });

  it("fires the same reveal clause when it moves out of breeding", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          breeding: { card: CARD_ID, as: "kudamon" },
          battleArea: [{ card: DATA_SQUAD_TAMER, as: "tamer" }],
          hand: [{ card: "BT1-014", as: "spare" }],
          deck: [
            { card: HOLY_BEAST, as: "toHand" },
            { card: DATA_SQUAD, as: "toSave" },
            { card: NON_MATCH, as: "nonMatch" },
            { card: "BT1-012", as: "sentinel" },
          ],
          security: ["BT1-013"],
        },
        1: { security: ["BT1-014"], deck: ["BT1-013"] },
      },
      { autoSelectCards: true, autoOrderCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("toHand").instanceId);
    await s.ready();

    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === "Breeding" && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("kudamon").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("tamer").stack.length === 1);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([DATA_SQUAD_TAMER, CARD_ID]);
    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("spare").instanceId, s.inst("toHand").instanceId]),
    );
    expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("toSave").instanceId]);
    expect(s.perm("tamer").stack[0]!.faceUp).toBe(false);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("sentinel").instanceId,
      s.inst("nonMatch").instanceId,
    ]);
    assertNoLoudGap(s);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("gives one opposing Digimon Security A. -1 on the public attack route", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-014", as: "host", under: [{ card: CARD_ID, as: "kudamon" }], dp: 20_000 }],
          hand: [{ card: "BT1-012", as: "spare" }],
          deck: ["BT1-012", "BT1-013"],
          security: ["BT1-013"],
        },
        1: {
          battleArea: [{ card: NON_MATCH, as: "victim", dp: 20_000 }],
          security: [{ card: "BT1-014", as: "opponentSecurity" }],
          deck: ["BT1-013"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const hostId = s.perm("host").permanentId;

    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: hostId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    await settle(() => observe(s.engine).keywordAmount(s.perm("victim"), "SecurityAttack") === -1);

    expect(observe(s.engine).keywordAmount(s.perm("victim"), "SecurityAttack")).toBe(-1);
    const host = s.state.players[0]!.battleArea.find(({ permanentId }) => permanentId === hostId)!;
    expect(host.stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("kudamon").instanceId]);
    expect(host.isSuspended).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("drops the debuffed Digimon's own attack to zero security checks on the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-014", as: "host", under: [{ card: CARD_ID, as: "kudamon" }], dp: 20_000 }],
          security: [{ card: "BT1-013", as: "mySecurity" }],
          deck: ["BT1-012", "BT1-013"],
        },
        1: {
          battleArea: [{ card: NON_MATCH, as: "victim", dp: 20_000 }],
          security: ["BT1-014"],
          deck: ["BT1-013"],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    await attackWindow(s, "host");
    await settle(() => observe(s.engine).keywordAmount(s.perm("victim"), "SecurityAttack") === -1);

    s.state.turnSeat = 1;
    expect(observe(s.engine).keywordAmount(s.perm("victim"), "SecurityAttack")).toBe(-1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("victim").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([s.inst("mySecurity").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("victim").isSuspended).toBe(true);
  });

  it("grants Security A. -1 to exactly one of the opponent's Digimon and never to your own", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-014", as: "host", under: [{ card: CARD_ID, as: "kudamon" }], dp: 20_000 },
            { card: NON_MATCH, as: "ally", dp: 20_000 },
          ],
        },
        1: {
          battleArea: [
            { card: NON_MATCH, as: "first", dp: 20_000 },
            { card: "BT1-012", as: "second", dp: 20_000 },
          ],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    await attackWindow(s, "host");
    await settle(() => s.state.pendingDecision === undefined);

    const amounts = ["first", "second"].map((alias) =>
      observe(s.engine).keywordAmount(s.perm(alias), "SecurityAttack"),
    );
    expect(amounts.filter((amount) => amount === -1)).toHaveLength(1);
    expect(amounts.filter((amount) => amount === 0)).toHaveLength(1);
    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(0);
    expect(observe(s.engine).keywordAmount(s.perm("ally"), "SecurityAttack")).toBe(0);
  });

  it("refuses a second grant in the same turn and reopens on the controller's next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-014", as: "host", under: [{ card: CARD_ID, as: "kudamon" }], dp: 20_000 }],
          hand: [{ card: "BT1-012", as: "spare" }],
          deck: ["BT1-009", "BT1-012", "BT1-013"],
          security: ["BT1-013"],
        },
        1: {
          battleArea: [
            { card: NON_MATCH, as: "first", dp: 20_000 },
            { card: "BT1-012", as: "second", dp: 20_000 },
          ],
          deck: ["BT1-009", "BT1-012", "BT1-013"],
          security: ["BT1-014"],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    await attackWindow(s, "host");
    await settle(() => s.state.pendingDecision === undefined);
    const granted = ["first", "second"].filter(
      (alias) => observe(s.engine).keywordAmount(s.perm(alias), "SecurityAttack") === -1,
    );
    expect(granted).toHaveLength(1);
    const other = ["first", "second"].find((alias) => alias !== granted[0])!;

    await attackWindow(s, "host");
    await settle(() => s.state.pendingDecision === undefined);
    expect(observe(s.engine).keywordAmount(s.perm(other), "SecurityAttack")).toBe(0);
    expect(observe(s.engine).keywordAmount(s.perm(granted[0]!), "SecurityAttack")).toBe(-1);

    s.state.turnSeat = 1;
    await advance(s.engine).runTurn(1);
    expect(observe(s.engine).keywordAmount(s.perm(granted[0]!), "SecurityAttack")).toBe(0);

    s.state.turnSeat = 0;
    await attackWindow(s, "host");
    await settle(() => s.state.pendingDecision === undefined);
    const regranted = ["first", "second"].filter(
      (alias) => observe(s.engine).keywordAmount(s.perm(alias), "SecurityAttack") === -1,
    );
    expect(regranted).toHaveLength(1);
  });

  it("grants the clause only from inside the stack, and only to the Digimon it is under", async () => {
    const withoutKudamon = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-014", as: "host", under: ["BT1-012"], dp: 20_000 }] },
        1: { battleArea: [{ card: NON_MATCH, as: "victim", dp: 20_000 }] },
      },
      { autoSelectCards: true },
    );
    await withoutKudamon.ready();
    await attackWindow(withoutKudamon, "host");
    await settle(() => withoutKudamon.state.pendingDecision === undefined);
    expect(observe(withoutKudamon.engine).keywordAmount(withoutKudamon.perm("victim"), "SecurityAttack")).toBe(0);

    const peerAttacks = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-014", as: "host", under: [{ card: CARD_ID, as: "kudamon" }], dp: 20_000 },
            { card: "BT1-012", as: "peer", dp: 20_000 },
          ],
        },
        1: { battleArea: [{ card: NON_MATCH, as: "victim", dp: 20_000 }] },
      },
      { autoSelectCards: true },
    );
    await peerAttacks.ready();
    await attackWindow(peerAttacks, "peer");
    await settle(() => peerAttacks.state.pendingDecision === undefined);
    expect(observe(peerAttacks.engine).keywordAmount(peerAttacks.perm("victim"), "SecurityAttack")).toBe(0);
  });
});
