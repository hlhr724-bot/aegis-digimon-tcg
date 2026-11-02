import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT26-060.js";
import "../index.js";

const CARD_ID = "BT26-060";

describe("BT26-060 Chronomon: Destroy Mode", () => {
  it("issue #5228: Q7081 leaves a standalone Digimon on the field", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: CARD_ID, as: "chronomon" }] },
        1: { battleArea: [{ card: "BT1-009", as: "standalone" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 20;
    const id = s.perm("standalone").permanentId;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chronomon").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toContain(id);
    expect(s.state.players[1]!.deck).toHaveLength(0);
  });

  it("matches the catalog and encodes the two alternate evolutions, keywords, Succession, and watcher", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      nameEn: "Chronomon: Destroy Mode",
      colors: ["Black", "Red"],
      kinds: ["Digimon"],
      level: 7,
      playCost: 16,
      dp: 16000,
      types: ["Shaman", "Titan", "Iliad", "TS"],
    });
    expect(compiled).toMatchObject({
      coverage: "full",
      residual: [],
      digivolutionRequirement: [
        { level: 6, texts: ["Chronomon"], cost: 5, isAlternate: true },
        { namesExact: ["Giant Slayer"], cost: 5, isAlternate: true },
      ],
    });
    expect(compiled.keywords?.map(({ keyword }) => keyword)).toEqual(
      expect.arrayContaining(["SecurityAttack", "Reboot", "Blocker", "Succession"]),
    );
    expect(compiled.effects?.slice(0, 2).map(({ trigger }) => trigger)).toEqual(["OnPlay", "WhenDigivolving"]);
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "Static",
      actions: [{ kind: "GrantStatic", grant: "effects", topmostOnly: true }],
    });
    expect(compiled.effects?.[3]).toMatchObject({
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenEffectAddsToDeck",
          oncePerTurnKey: `${CARD_ID}/delete-on-effect-adds-to-deck`,
        },
      ],
    });
  });

  it("uses each exact alternate evolution path and rejects a non-matching Lv.6", async () => {
    const chronomon = setupEngine({
      0: {
        battleArea: [{ card: "BT26-078", as: "textBase" }],
        hand: [{ card: CARD_ID, as: "destroyMode" }],
      },
    });
    chronomon.state.memory = 5;
    await chronomon.ready();
    expect(
      chronomon.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: chronomon.perm("textBase").permanentId,
        instanceId: chronomon.inst("destroyMode").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => chronomon.perm("textBase").topCard.cardId === CARD_ID);
    expect(chronomon.state.memory).toBe(0);

    const giantSlayer = setupEngine({
      0: {
        battleArea: [{ card: "BT26-085", as: "giantSlayerBase" }],
        hand: [{ card: CARD_ID, as: "destroyMode" }],
      },
    });
    giantSlayer.state.memory = 5;
    await giantSlayer.ready();
    expect(
      giantSlayer.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: giantSlayer.perm("giantSlayerBase").permanentId,
        instanceId: giantSlayer.inst("destroyMode").instanceId,
        alternateRequirementIndex: 1,
      }),
    ).toEqual({ ok: true });
    await settle(() => giantSlayer.perm("giantSlayerBase").topCard.cardId === CARD_ID);
    expect(giantSlayer.state.memory).toBe(0);

    const invalid = setupEngine({
      0: {
        battleArea: [{ card: "BT26-017", as: "nonMatchingBase" }],
        hand: [{ card: CARD_ID, as: "destroyMode" }],
      },
    });
    invalid.state.memory = 5;
    await invalid.ready();
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("nonMatchingBase").permanentId,
        instanceId: invalid.inst("destroyMode").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("leaves a protected stack intact while returning an unprotected stack", async () => {
    const preferred: string[] = [];
    const options = {
      autoAcceptOptional: true,
      autoDeclineOptional: false,
      autoSelectCards: true,
      autoOrderCards: true,
      preferInstanceIds: preferred,
    };
    const s = setupEngine(
      {
        0: { hand: [{ card: CARD_ID, as: "chronomon" }] },
        1: {
          battleArea: [
            { card: "BT26-029", as: "holy", under: [{ card: "BT26-012", as: "protectedSource" }] },
            { card: "BT1-015", as: "unprotected", under: [{ card: "BT1-009", as: "remaining" }] },
          ],
          security: ["BT1-009"],
        },
      },
      options,
    );
    preferred.push(s.perm("holy").permanentId);
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("holy"));
    options.autoAcceptOptional = false;
    options.autoDeclineOptional = true;
    const protectedTop = s.perm("holy").topCard.instanceId;
    s.state.memory = 20;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chronomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("unprotected").topCard.instanceId === s.inst("remaining").instanceId);
    expect(s.perm("holy").topCard.instanceId).toBe(protectedTop);
    expect(s.perm("holy").stack.map((card) => card.instanceId)).toEqual([s.inst("protectedSource").instanceId]);
    expect(s.state.players[1]!.deck.map((card) => card.cardId)).toEqual(["BT1-015"]);
  });

  it("Q7079/Q7081 returns the current top and at most 4 sources from exactly 3 targets, leaving one card", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: CARD_ID, as: "destroyMode" }] },
        1: {
          battleArea: [
            {
              card: "BT1-015",
              as: "deep",
              under: [
                { card: "BT1-009", as: "deepBottom" },
                { card: "BT1-010", as: "deepRemainingTop" },
                { card: "BT1-011", as: "deepReturned1" },
                { card: "BT1-012", as: "deepReturned2" },
                { card: "BT1-013", as: "deepReturned3" },
                { card: "BT1-014", as: "deepReturned4" },
              ],
            },
            {
              card: "BT1-015",
              as: "short",
              under: [
                { card: "BT1-009", as: "shortBottom" },
                { card: "BT1-010", as: "shortReturned" },
              ],
            },
            { card: "BT1-015", as: "third", under: [{ card: "BT1-009", as: "thirdBottom" }] },
            { card: "BT1-015", as: "fourth", under: [{ card: "BT1-009", as: "fourthBottom" }] },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 16;
    const untouchedTop = s.perm("fourth").topCard.instanceId;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("destroyMode").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("deep").stack.length === 1);

    expect(s.perm("deep").topCard.instanceId).toBe(s.inst("deepRemainingTop").instanceId);
    expect(s.perm("deep").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("deepBottom").instanceId]);
    expect(s.perm("short").topCard.instanceId).toBe(s.inst("shortBottom").instanceId);
    expect(s.perm("short").stack).toHaveLength(0);
    expect(s.perm("third").topCard.instanceId).toBe(s.inst("thirdBottom").instanceId);
    expect(s.perm("fourth").topCard.instanceId).toBe(untouchedTop);
    expect(s.state.players[1]!.deck).toHaveLength(8);
  });

  it("publicly plays and resolves the On Play deck return and deletion watcher", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: CARD_ID, as: "destroyMode" }] },
        1: {
          battleArea: [
            { card: "BT1-015", as: "first", under: [{ card: "BT1-009", as: "firstSource" }] },
            { card: "BT1-016", as: "second", under: [{ card: "BT1-010", as: "secondSource" }] },
            { card: "BT1-017", as: "third", under: [{ card: "BT1-011", as: "thirdSource" }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 16;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("destroyMode").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 2);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[1]!.deck).toHaveLength(3);
    expect(s.state.players[1]!.trash).toHaveLength(1);
  });

  it("Q7080 lets the activating player order every returned card on the deck", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "destroyMode" }] },
        1: {
          battleArea: [
            { card: "BT1-015", as: "first", under: [{ card: "BT1-009", as: "firstBottom" }] },
            { card: "BT1-016", as: "second", under: [{ card: "BT1-010", as: "secondBottom" }] },
            { card: "BT1-017", as: "third", under: [{ card: "BT1-011", as: "thirdBottom" }] },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderCards: false },
    );
    await s.ready();

    const resolving = advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("destroyMode"));
    await settle(() => s.state.pendingDecision?.kind === "orderCards");
    const decision = s.state.pendingDecision!;
    const request = s.decisions.at(-1)!.req;
    const offered = request.options?.candidateInstanceIds ?? [];
    expect(offered).toHaveLength(3);
    expect(s.decisions.at(-1)?.seat).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "orderCards", order: [...offered].reverse() },
      }),
    ).toEqual({ ok: true });
    await resolving;

    expect(s.state.players[1]!.deck.map(({ instanceId }) => instanceId)).toEqual([...offered].reverse());
  });

  it("Q7083 trashes the resulting Option permanent at the following rule check", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "destroyMode" }] },
        1: {
          battleArea: [
            { card: "BT1-015", as: "optionStack", under: [{ card: "BT1-090", as: "optionBottom" }] },
            { card: "BT1-016", as: "second", under: [{ card: "BT1-009", as: "secondBottom" }] },
            { card: "BT1-017", as: "third", under: [{ card: "BT1-010", as: "thirdBottom" }] },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderCards: true },
    );
    const optionPermanentId = s.perm("optionStack").permanentId;
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("destroyMode"));

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(optionPermanentId);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("optionBottom").instanceId);
  });

  it("Q7082 trashes a promoted no-DP Digi-Egg but keeps a promoted Tamer in play as a Tamer", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "destroyMode" }] },
        1: {
          battleArea: [
            { card: "BT1-015", as: "noDpStack", under: [{ card: "BT1-001", as: "eggBottom" }] },
            { card: "BT1-016", as: "tamerStack", under: [{ card: "BT1-089", as: "tamerBottom" }] },
            { card: "BT1-017", as: "third", under: [{ card: "BT1-009", as: "thirdBottom" }] },
            { card: "BT1-089", as: "ordinaryTamer" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderCards: true },
    );
    const invalidPermanentId = s.perm("noDpStack").permanentId;
    const tamerStackId = s.perm("tamerStack").permanentId;
    const ordinaryTamerId = s.perm("ordinaryTamer").permanentId;
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("destroyMode"));

    const battleAreaIds = s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId);
    expect(battleAreaIds).not.toContain(invalidPermanentId);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("eggBottom").instanceId);
    // BT5-094 Q1372 / BT17-011 Q2729: a stack whose top becomes a Tamer stays in play as a Tamer.
    expect(battleAreaIds).toContain(tamerStackId);
    expect(battleAreaIds).toContain(ordinaryTamerId);
    const tamerStack = s.perm("tamerStack");
    expect(tamerStack.topCard.instanceId).toBe(s.inst("tamerBottom").instanceId);
    expect(tamerStack.invalidNoDpStackTop).toBe(false);
    expect(tamerStack.baseDP).toBe(0);
  });

  it("Q7084-Q7086 reacts to its effect adding to the opponent's deck, then spends the shared turn budget", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "destroyMode" }],
          trash: [{ card: "BT1-009", as: "ownReturn" }],
        },
        1: {
          battleArea: [
            { card: "BT1-015", as: "stacked", under: [{ card: "BT1-009", as: "bottom" }] },
            { card: "BT1-016", as: "firstVictim" },
            { card: "BT1-017", as: "secondVictim" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("destroyMode"));
    expect(s.state.players[1]!.battleArea).toHaveLength(2);

    await advance(s.engine).verb.returnToDeck([s.inst("ownReturn").instanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toContain(s.inst("ownReturn").instanceId);
  });

  it("Q7084/Q7085 also reacts when an effect adds a card to its controller's deck", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "destroyMode" }],
          trash: [{ card: "BT1-009", as: "ownReturn" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "victim" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.returnToDeck([s.inst("ownReturn").instanceId]);

    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toContain(s.inst("ownReturn").instanceId);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("resolves its own When Digivolving after the Succession Holy Mode effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-016", as: "base" }],
          hand: [{ card: CARD_ID, as: "evolution" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-015", as: "victim", dp: 1000 },
            { card: "BT1-015", as: "stacked", under: ["BT1-009", "BT1-009"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferTriggerKeys: ["BT26-016"] },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle();
    const triggers = s.events.filter((event) => event.kind === "effectTriggered" && event.timing === "WhenDigivolving");
    expect(triggers.map((event) => (event.kind === "effectTriggered" ? event.sourceCardId : ""))).toEqual(
      expect.arrayContaining(["BT26-016", CARD_ID]),
    );
    expect(
      triggers.map((event) => (event.kind === "effectTriggered" ? event.sourceCardId : "")).indexOf("BT26-016"),
    ).toBeLessThan(
      triggers.map((event) => (event.kind === "effectTriggered" ? event.sourceCardId : "")).indexOf(CARD_ID),
    );
    expect(s.state.players[1]!.deck).toHaveLength(2);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Succession confers only the highest matching Chronomon card's effects", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: CARD_ID,
              as: "destroyMode",
              under: [
                { card: "BT26-016", as: "lowerHolyMode" },
                { card: "BT26-017", as: "nonChronomon" },
                { card: "BT26-016", as: "highestHolyMode" },
              ],
            },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "firstVictim", dp: 1000 },
            { card: "BT1-010", as: "secondVictim", dp: 1000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("destroyMode"));

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(Array.from(s.perm("destroyMode").keywords)).toEqual(
      expect.arrayContaining(["Piercing", "Engage", "Reboot", "Blocker"]),
    );
  });

  it("doesn't delete a Digimon when the optional deck-add reaction is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "destroyMode" }],
          trash: [{ card: "BT1-009", as: "ownReturn" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "victim" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.returnToDeck([s.inst("ownReturn").instanceId]);

    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toContain(s.inst("ownReturn").instanceId);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("victim").permanentId,
    );
  });
  it("Succession confers Holy Mode's When Digivolving through an effect-driven digivolution", async () => {
    // CR 16-47-1: ＜Succession＞ reads "This Digimon gains all effects other than ＜Succession＞ on
    // its topmost specified digivolution card", so the gained [When Digivolving] must fire in the
    // same window as Destroy Mode's own — including when the digivolution is driven by an effect
    // (BT26-085 Giant Slayer's replacement digivolve) rather than by the player's own action.
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT26-085", as: "giantSlayer", under: [{ card: "BT26-016", as: "holyMode" }] }],
          hand: [{ card: CARD_ID, as: "destroyMode" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          trash: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-015", as: "victim", dp: 1000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("giantSlayer").permanentId], "byEffect")).toBe(0);
    await settle(() => s.perm("giantSlayer").topCard.cardId === CARD_ID);

    const whenDigivolving = s.events
      .filter((event) => event.kind === "effectTriggered" && event.timing === "WhenDigivolving")
      .map((event) => (event.kind === "effectTriggered" ? event.sourceCardId : ""));
    expect(whenDigivolving).toEqual(expect.arrayContaining(["BT26-016", CARD_ID]));
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("Succession still confers Holy Mode's When Attacking after an effect-driven digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "destroyMode", under: [{ card: "BT26-016", as: "holyMode" }] }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          trash: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-015", as: "victim", dp: 1000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("destroyMode"));

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });
});

describe("BT26-060 Chronomon: Destroy Mode — KB Q&A rulings", () => {
  async function digivolveFrom(base: string) {
    const s = setupEngine({
      0: {
        battleArea: [{ card: base, as: "base" }],
        hand: [{ card: CARD_ID, as: "destroyMode" }],
      },
    });
    s.state.memory = 5;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("destroyMode").instanceId,
      alternateRequirementIndex: 0,
    });
    await settle(() => s.state.pendingDecision === undefined);
    return { s, result };
  }

  it.each([
    { base: "BT26-016", where: "part of its name" },
    { base: "BT26-078", where: "its effects only" },
  ])(
    "digivolves from a level 6 with [Chronomon] in $where as a card with [Chronomon] in its text (Q7087)",
    async ({ base }) => {
      const { s, result } = await digivolveFrom(base);

      expect(result).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === CARD_ID);
      expect(s.state.memory).toBe(0);
    },
  );

  it("rejects a level 6 with no [Chronomon] in its text (Q7087)", async () => {
    const { s, result } = await digivolveFrom("BT26-017");

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(s.perm("base").topCard.cardId).toBe("BT26-017");
  });
});
