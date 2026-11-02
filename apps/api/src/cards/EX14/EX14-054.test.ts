import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { syntheticDefinitions } from "#api/engine/testkit/syntheticDefinitions";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

const neutralCards = [
  { cardId: "neutral-evil", types: ["Evil"], level: 3, playCost: 6 },
  { cardId: "neutral-wizard", types: ["Wizard"], level: 4, playCost: 6 },
  { cardId: "neutral-fallen", types: ["Fallen Angel"], level: 5, playCost: 6 },
  { cardId: "neutral-greed-three", types: ["Greed"], level: 3, playCost: 6 },
  { cardId: "neutral-greed-four", types: ["Greed"], level: 4, playCost: 6 },
  { cardId: "neutral-greed-five", types: ["Greed"], level: 5, playCost: 6 },
  { cardId: "neutral-expensive", types: ["Evil"], level: 5, playCost: 7 },
  { cardId: "neutral-near-trait", types: ["Evil Dragon"], level: 3, playCost: 3 },
];

beforeAll(() => {
  for (const definition of neutralCards) {
    syntheticDefinitions.set(definition.cardId, { ...getCardDefinition("BT1-009")!, ...definition });
  }
});

afterAll(() => {
  for (const { cardId } of neutralCards) {
    syntheticDefinitions.delete(cardId);
  }
});

describe("Barbamon", () => {
  it("plays an eligible Evil from trash, discards the opponent hand and deletes tied lowest levels", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX14-054", as: "source" }], trash: [{ card: "BT2-068", as: "evil" }] },
        1: {
          hand: ["BT1-009", "BT1-009"],
          battleArea: [{ card: "BT1-009" }, { card: "BT1-009" }, { card: "BT1-015" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toContain("BT2-068");
    expect(s.state.players[1]!.hand).toHaveLength(1);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-015"]);
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("source"));
    expect(s.state.players[1]!.hand).toHaveLength(1);
  });
  it("still discards when no eligible Digimon can be played", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "EX14-054", as: "source" }], trash: ["BT1-009"] }, 1: { hand: ["BT1-009"] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.hand).toHaveLength(0);
  });
  it("allows declining revival and deletion while the mandatory discard resolves", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX14-054", as: "source" }], trash: ["BT2-068"] },
        1: { hand: ["BT1-009"], battleArea: [{ card: "BT1-009" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.hand).toHaveLength(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });
  it.each(["neutral-evil", "neutral-wizard", "neutral-fallen", "neutral-greed-three"])(
    "revives a cost-six %s from a mixed trash pool without paying memory",
    async (card) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "EX14-054", as: "source" }],
            trash: ["neutral-expensive", "neutral-near-trait", "BT1-009", card],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      const memory = s.state.memory;
      await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("source"));
      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX14-054", card]);
      expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual([
        "neutral-expensive",
        "neutral-near-trait",
        "BT1-009",
      ]);
      expect(s.state.memory).toBe(memory);
    },
  );

  it.each([EffectTiming.OnPlay, EffectTiming.WhenDigivolving, EffectTiming.OnUseAttack])(
    "shares the once-per-turn use after timing %s",
    async (timing) => {
      const s = setupEngine(
        { 0: { battleArea: [{ card: "EX14-054", as: "source" }] }, 1: { hand: ["BT1-009", "BT1-009", "BT1-009"] } },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      for (const next of [timing, EffectTiming.OnPlay, EffectTiming.WhenDigivolving, EffectTiming.OnUseAttack]) {
        await advance(s.engine).fire(next, s.perm("source"));
      }
      expect(s.state.players[1]!.hand).toHaveLength(2);
    },
  );

  it("ignores the controller's discarded hand and deletes only once for repeated opposing discards", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT1-009", as: "ownHand" }], battleArea: [{ card: "EX14-054", as: "source" }] },
        1: {
          hand: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-009", as: "second" },
          ],
          battleArea: [{ card: "BT1-009" }, { card: "BT1-015" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.trash([s.inst("ownHand").instanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    await advance(s.engine).verb.trash([s.inst("first").instanceId]);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-015"]);
    await advance(s.engine).verb.trash([s.inst("second").instanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("digivolves from a red level five for four memory and preserves the stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-021", as: "base", under: ["BT1-009"] }],
          hand: [{ card: "EX14-054", as: "evolution" }],
          deck: ["BT1-009"],
        },
        1: { hand: ["BT1-009"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.hand.length === 0);
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").topCard.cardId).toBe("EX14-054");
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT1-009", "BT1-021"]);
  });

  it.each(["neutral-fallen", "neutral-greed-five"])(
    "digivolves over %s for three and preserves its evolution stack",
    async (card) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card, as: "base", under: ["BT1-009"] }],
            hand: [{ card: "EX14-054", as: "evolution" }],
            deck: ["BT1-009"],
          },
          1: { hand: ["BT1-009"] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 3;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("evolution").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.hand.length === 0);
      expect(s.state.memory).toBe(0);
      expect(s.perm("base").topCard.cardId).toBe("EX14-054");
      expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT1-009", card]);
      expect(observe(s.engine).hasKeyword(s.perm("base"), "Alliance")).toBe(true);
      expect(observe(s.engine).hasKeyword(s.perm("base"), "Engage")).toBe(true);
    },
  );

  it.each(["neutral-wizard", "BT1-038"])("rejects alternate evolution from %s", async (card) => {
    const s = setupEngine({ 0: { battleArea: [{ card, as: "base" }], hand: [{ card: "EX14-054", as: "evolution" }] } });
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
        useAlternateCost: true,
      }).ok,
    ).toBe(false);
    expect(s.state.memory).toBe(3);
  });

  it.each([
    { materials: ["neutral-greed-three", "neutral-greed-four", "neutral-greed-five"], valid: true },
    { materials: ["neutral-greed-three", "neutral-greed-three", "neutral-greed-five"], valid: false },
    { materials: ["neutral-greed-three", "neutral-wizard", "neutral-greed-five"], valid: false },
    { materials: ["neutral-greed-three", "neutral-greed-four"], valid: false },
  ])("validates Assembly materials $materials", async ({ materials, valid }) => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX14-054", as: "source" }],
          trash: materials.map((card, index) => ({ card, as: `material${index}` })),
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 8;
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("source").instanceId,
        assembly: { materialInstanceIds: materials.map((_, index) => s.inst(`material${index}`).instanceId) },
      }).ok,
    ).toBe(valid);
    if (valid) {
      await settle(() => s.state.players[0]!.battleArea.length === 1);
    }
    expect(s.state.memory).toBe(valid ? 0 : 8);
    expect(s.state.players[0]!.battleArea).toHaveLength(valid ? 1 : 0);
    expect(s.state.players[0]!.trash).toHaveLength(valid ? 0 : materials.length);
    const actualSources = [...s.state.players[0]!.battleArea].flatMap(({ stack }) => stack.map(({ cardId }) => cardId));
    expect(new Set(actualSources)).toEqual(new Set(valid ? materials : []));
  });
  it("uses Alliance in a real attack to suspend an ally and check two security cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX14-054", as: "source" },
            { card: "BT1-009", as: "ally" },
          ],
        },
        1: { security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: s.perm("ally").permanentId }).ok,
    );
    await advance(s.engine).finishAttack();
    expect(s.perm("ally").isSuspended).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("allows declining Engage at the end of the turn", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "EX14-054", as: "source" }] }, 1: { security: ["BT1-009"] } },
      { autoSelectCards: true },
    );
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await turn;
    expect(s.perm("source").isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it("watches the opponent's discard on their turn", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX14-054", as: "source" }] },
        1: { hand: [{ card: "BT1-009", as: "discard" }], battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    await advance(s.engine).verb.trash([s.inst("discard").instanceId], 1);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });
  it("identifies the current revival, discard and deletion passages in decision metadata", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX14-054", as: "source" }], trash: ["BT2-068"] },
        1: { hand: ["BT1-009", "BT1-015"], battleArea: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
    expect(
      s.events.filter((event) => event.kind === "cardsMoved" && event.from === "hand" && event.to === "trash"),
    ).toEqual([expect.objectContaining({ seat: 1, cardIds: ["BT1-009"], artIds: ["BT1-009"] })]);
    const decisions = s.decisions.filter(({ req }) => req.sourceCardId === "EX14-054");
    const revival =
      "You may play 1 play cost 6 or lower [Evil], [Wizard], [Fallen Angel] or [Greed] trait Digimon card from your trash without paying the cost.";
    const discard = "Then, your opponent trashes 1 card in their hand.";
    const deletion = "When your opponent's hand is trashed from, you may delete all of their lowest level Digimon.";
    expect(new Set(decisions.map(({ req }) => req.options?.effectTextPart))).toEqual(
      new Set([revival, discard, deletion]),
    );
    expect(decisions.find(({ seat }) => seat === 1)?.req.options?.effectTextPart).toBe(discard);
    const printed = getCardDefinition("EX14-054")!.effectText!;
    for (const part of [revival, discard, deletion]) {
      expect(printed).toContain(part);
    }
  });
});
