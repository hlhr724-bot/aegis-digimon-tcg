import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import "../index.js";
import { compiled } from "./EX13-027.js";

const cardId = "EX13-027";

const SUKAMON = "BT3-063";
const ETEMON = "BT3-070";
const PLATINUM_SUKAMON = "BT13-065";
const TEXT_ONLY_SUKAMON = "BT11-063";
const ARCHETYPE_NON_MATCH = "BT3-061";

const SENTINEL = "BT1-009";
const NEUTRAL_LV3 = "BT1-013";

const YELLOW_EGG = "BT1-005";
const BLACK_EGG = "BT10-005";
const GREEN_EGG = "BT1-007";
const YELLOW_LV4 = "BT3-037";

describe("EX13-027 Chuumon", () => {
  it("matches the catalog printed text, stats and dual evolution costs", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      nameEn: "Chuumon",
      colors: ["Yellow"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      forms: ["Rookie"],
      attributes: ["Virus"],
      types: ["Beast"],
      evoCosts: [
        { color: "Yellow", level: 2, memoryCost: 0 },
        { color: "Black", level: 2, memoryCost: 0 },
      ],
      effectText:
        "[When Moving] [On Play] Reveal the top 3 cards of your deck. Among them, add 1 card with [Sukamon] or [Etemon] in its name to the hand and trash 1 such card. Return the rest to the bottom of the deck.",
      inheritedEffectText:
        "[All Turns] [Once Per Turn] When this Digimon would leave the battle area other than by your effects, by deleting 1 other Digimon with [Sukamon] in its name, it doesn't leave.",
    });
  });

  it("compiles every printed clause", () => {
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toBeUndefined();

    const nameUnion = {
      controllerDefault: "mine",
      nameOrTrait: [{ tokens: ["Sukamon", "Etemon"], match: "name" }],
    };
    for (const trigger of ["WhenMoving", "OnPlay"]) {
      const effect = compiled.effects.find((candidate) => candidate.trigger === trigger)!;
      expect(effect.isInherited).toBeUndefined();
      expect(effect.actions).toEqual([
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "add 1 card with [Sukamon] or [Etemon] in its name to the hand",
              filter: nameUnion,
              count: 1,
              to: "hand",
            },
            { effectTextPart: "trash 1 such card.", filter: nameUnion, count: 1, to: "trash", requiresMinRevealed: 2 },
          ],
          rest: "deckBottom",
        },
      ]);
    }

    const inherited = compiled.effects.find((effect) => effect.isInherited)!;
    expect(inherited).toMatchObject({
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          leaveCause: "otherThanYourEffect",
          sourceFilter: { isSelfRef: true },
          actions: [],
          cost: {
            kind: "deleteOwn",
            target: {
              filter: {
                controller: "any",
                excludeSelf: true,
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Sukamon"], match: "name" }],
              },
              count: 1,
            },
          },
        },
      ],
    });
    expect(compiled.effects.some(({ isSecurity }) => isSecurity)).toBe(false);
  });

  it("Q7286 trashes only a second specified card and bottoms the text-only near-match", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "chuumon" }],
          deck: [
            { card: SUKAMON, as: "toHand" },
            { card: ETEMON, as: "toTrash" },
            { card: TEXT_ONLY_SUKAMON, as: "nearMatch" },
            { card: SENTINEL, as: "sentinel" },
          ],
          security: [SENTINEL],
        },
        1: { security: [SENTINEL], deck: [SENTINEL] },
      },
      { autoSelectCards: true, autoOrderCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("toHand").instanceId);
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chuumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.length > 0);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([cardId]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("toHand").instanceId]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("toTrash").instanceId]);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("sentinel").instanceId,
      s.inst("nearMatch").instanceId,
    ]);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });

  it("Q7285 adds the sole specified card and trashes nothing", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "chuumon" }],
          deck: [
            { card: PLATINUM_SUKAMON, as: "substringMatch" },
            { card: TEXT_ONLY_SUKAMON, as: "nearMatch" },
            { card: ARCHETYPE_NON_MATCH, as: "nonMatch" },
            { card: SENTINEL, as: "sentinel" },
          ],
          security: [SENTINEL],
        },
        1: { security: [SENTINEL], deck: [SENTINEL] },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chuumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some(({ cardId: id }) => id === PLATINUM_SUKAMON));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("substringMatch").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("sentinel").instanceId,
      s.inst("nearMatch").instanceId,
      s.inst("nonMatch").instanceId,
    ]);
    assertNoLoudGap(s);
  });

  it("returns all three revealed cards when none carries either name token", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: cardId, as: "chuumon" }],
          deck: [
            { card: TEXT_ONLY_SUKAMON, as: "nearMatch" },
            { card: ARCHETYPE_NON_MATCH, as: "nonMatch" },
            { card: "BT1-012", as: "thirdMiss" },
            { card: SENTINEL, as: "sentinel" },
          ],
          security: [SENTINEL],
        },
        1: { security: [SENTINEL], deck: [SENTINEL] },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chuumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === cardId));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("sentinel").instanceId,
      s.inst("nearMatch").instanceId,
      s.inst("nonMatch").instanceId,
      s.inst("thirdMiss").instanceId,
    ]);
    assertNoLoudGap(s);
  });

  it("fires the same reveal clause when it moves out of breeding", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          breeding: { card: cardId, as: "chuumon" },
          hand: [{ card: "BT1-014", as: "spare" }],
          deck: [
            { card: SUKAMON, as: "toHand" },
            { card: ETEMON, as: "toTrash" },
            { card: TEXT_ONLY_SUKAMON, as: "nearMatch" },
            { card: SENTINEL, as: "sentinel" },
          ],
          security: [SENTINEL],
        },
        1: { security: [SENTINEL], deck: [SENTINEL] },
      },
      { autoSelectCards: true, autoOrderCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("toHand").instanceId);
    await s.ready();

    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === "Breeding" && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("chuumon").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.length > 0);

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([cardId]);
    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("spare").instanceId, s.inst("toHand").instanceId]),
    );
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("toTrash").instanceId]);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("sentinel").instanceId,
      s.inst("nearMatch").instanceId,
    ]);
    assertNoLoudGap(s);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("digivolves from a yellow and from a black Lv.2 egg for 0, and refuses a green egg", async () => {
    for (const egg of [YELLOW_EGG, BLACK_EGG]) {
      const s = setupEngine({
        0: {
          breeding: { card: egg, as: "egg" },
          hand: [{ card: cardId, as: "chuumon" }],
          deck: [{ card: SENTINEL, as: "bonusDraw" }],
        },
      });
      s.state.memory = 0;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("egg").permanentId,
          instanceId: s.inst("chuumon").instanceId,
          useAlternateCost: false,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("egg").topCard.cardId === cardId);

      expect(s.state.memory).toBe(0);
      expect(s.perm("egg").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("egg").instanceId]);
      expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("bonusDraw").instanceId]);
      expect(s.state.players[0]!.deck).toHaveLength(0);
    }

    const illegal = setupEngine({
      0: {
        breeding: { card: GREEN_EGG, as: "egg" },
        hand: [{ card: cardId, as: "chuumon" }],
        deck: [SENTINEL],
      },
    });
    illegal.state.memory = 0;
    await illegal.ready();

    expect(
      illegal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: illegal.perm("egg").permanentId,
        instanceId: illegal.inst("chuumon").instanceId,
        useAlternateCost: false,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(illegal.perm("egg").topCard.cardId).toBe(GREEN_EGG);
    expect(illegal.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      illegal.inst("chuumon").instanceId,
    ]);
  });

  it("Q7287 may preserve the host by deleting your own [Sukamon]-named Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: NEUTRAL_LV3, as: "host", under: [cardId] },
            { card: PLATINUM_SUKAMON, as: "fodder" },
          ],
          deck: [SENTINEL, SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([hostId]);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([PLATINUM_SUKAMON]);
  });

  it("cannot pay with a [Sukamon]-in-text card or an [Etemon]-named card, so the host leaves", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: NEUTRAL_LV3, as: "host", under: [cardId] },
            { card: TEXT_ONLY_SUKAMON, as: "textOnly" },
            { card: ETEMON, as: "etemon" },
          ],
          deck: [SENTINEL, SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("textOnly").permanentId,
      s.perm("etemon").permanentId,
    ]);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id).sort()).toEqual([cardId, NEUTRAL_LV3].sort());
  });

  it("refuses to pay with the host itself — the cost says 1 OTHER Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: PLATINUM_SUKAMON, as: "host", under: [cardId] }],
          deck: [SENTINEL, SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id).sort()).toEqual([cardId, PLATINUM_SUKAMON].sort());
  });

  it("Q7287 may preserve the host by deleting the opponent's [Sukamon]-named Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: NEUTRAL_LV3, as: "host", under: [cardId] }],
          deck: [SENTINEL, SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: {
          battleArea: [{ card: PLATINUM_SUKAMON, as: "opponentFodder" }],
          deck: [SENTINEL, SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([hostId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId: id }) => id)).toEqual([PLATINUM_SUKAMON]);
  });

  it("does NOT prevent a leave caused by the controller's own effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: NEUTRAL_LV3, as: "host", under: [cardId] },
            { card: PLATINUM_SUKAMON, as: "fodder" },
          ],
          deck: [SENTINEL, SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    advance(s.engine).verb.enterEffectResolution(0, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("fodder").permanentId,
    ]);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id).sort()).toEqual([cardId, NEUTRAL_LV3].sort());
  });

  it("prevents only ONE leave per turn and reopens after a real turn passes", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: NEUTRAL_LV3, as: "host", under: [cardId] },
            { card: PLATINUM_SUKAMON, as: "first" },
            { card: SUKAMON, as: "second" },
          ],
          deck: Array(10).fill(SENTINEL),
          security: [SENTINEL],
        },
        1: { deck: Array(10).fill(SENTINEL), security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(hostId);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(hostId);

    const revived = s.putOnBoard(0, { card: NEUTRAL_LV3, as: "host2", under: [cardId] });
    await s.ready();
    s.state.turnSeat = 1;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([revived.permanentId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(revived.permanentId);
  });

  it("does not grant the leave prevention without EX13-027 in the stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: NEUTRAL_LV3, as: "host", under: [SENTINEL] },
            { card: PLATINUM_SUKAMON, as: "fodder" },
          ],
          deck: [SENTINEL, SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("fodder").permanentId,
    ]);
  });

  it("grants the inherited prevention to a Digimon digivolved onto it, preserving source identity", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "chuumon", under: [{ card: YELLOW_EGG, as: "egg" }] },
            { card: PLATINUM_SUKAMON, as: "fodder" },
          ],
          hand: [{ card: YELLOW_LV4, as: "turuiemon" }],
          deck: [{ card: SENTINEL, as: "bonusDraw" }, SENTINEL, SENTINEL],
          security: [SENTINEL],
        },
        1: { deck: [SENTINEL, SENTINEL, SENTINEL], security: [SENTINEL] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("chuumon").permanentId,
        instanceId: s.inst("turuiemon").instanceId,
        useAlternateCost: false,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("chuumon").topCard.cardId === YELLOW_LV4);
    await settle(() => s.state.pendingDecision === undefined);

    const hostId = s.perm("chuumon").permanentId;
    expect(s.perm("chuumon").stack.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("egg").instanceId,
      s.inst("chuumon").instanceId,
    ]);
    expect(s.state.memory).toBe(0);

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([hostId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([hostId]);
    expect(s.perm("chuumon").topCard.cardId).toBe(YELLOW_LV4);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([PLATINUM_SUKAMON]);
  });
});
