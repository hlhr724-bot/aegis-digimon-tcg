import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, settle, setupEngine, type EngineSetup } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupScenario } from "#api/engine/testkit/scenario";
import opponentEvolutionFixture from "#api/engine/scenarios/bacchusmon-suspends-opponent-evolution.fixture";
import "./BT25-077.js";
import "../index.js";

const LOW = "BT1-009";
const HIGH = "BT1-019";
const TARGET = "BT25-078";
const CEILING_TS = "BT25-071";
const OVER_CEILING_TS = "BT25-073";
const CARD_ID = "BT25-077";

describe("BT25-077 Bacchusmon", () => {
  it("offers the opponent's evolving Digimon for suspension while all of its controller's Digimon are suspended", async () => {
    const preferred: string[] = [];
    const s = setupScenario(opponentEvolutionFixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferInstanceIds: preferred,
    });
    s.state.phase = Phase.Main;
    preferred.push(s.perm("opponent").permanentId);
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("opponent").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.perm("opponent").isSuspended);

    expect(s.perm("opponent").topCard.cardId).toBe(HIGH);
    expect(s.perm("opponent").isSuspended).toBe(true);
    expect(
      s.decisions.some(
        ({ seat, req }) =>
          seat === 0 &&
          req.sourceCardId === CARD_ID &&
          req.kind === "chooseTargets" &&
          req.options?.candidateInstanceIds?.includes(s.perm("opponent").permanentId),
      ),
    ).toBe(true);
  });

  it("matches every printed catalog field and alternate TS evolution requirement", () => {
    const card = getCardDefinition("BT25-077");
    expect(card).toBeDefined();
    if (card === undefined) return;
    expect(card).toMatchObject({
      nameEn: "Bacchusmon",
      colors: ["Black", "Green"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      evoCosts: [
        { color: "Black", level: 5, memoryCost: 4 },
        { color: "Green", level: 5, memoryCost: 4 },
      ],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Shaman", "Olympos XII", "Iliad", "TS"],
      maxCountInDeck: 4,
    });
    expect(card.effectText).toBeDefined();
    if (card.effectText === undefined) return;
    expect(card.effectText.replace(/\u00a0/g, " ")).toContain("[Digivolve] Lv.5 w/[TS] trait: Cost 3");
  });

  it.each([
    ["black", "BT10-064"],
    ["green", "BT1-075"],
  ] as const)("uses the ordinary %s Lv5 evolution at exact cost 4", async (_color, source) => {
    const s = setupEngine({
      0: { battleArea: [{ card: source, as: "base" }], hand: [{ card: CARD_ID, as: "bacchusmon" }] },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("bacchusmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === CARD_ID);
    expect(s.state.memory).toBe(1);
    expect(s.perm("base").topCard?.cardId).toBe(CARD_ID);
  });

  it("rejects a red Lv5 source on the ordinary route", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "AD1-002", as: "base" }], hand: [{ card: CARD_ID, as: "bacchusmon" }] },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("bacchusmon").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain(CARD_ID);
  });

  it("uses the TS Lv5 alternate for cost 3 and rejects a non-TS explicit route", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT25-073", as: "tsBase" }], hand: [{ card: CARD_ID, as: "bacchusmon" }] },
    });
    s.state.memory = 4;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("tsBase").permanentId,
        instanceId: s.inst("bacchusmon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 2,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tsBase").topCard.cardId === CARD_ID);
    expect(s.state.memory).toBe(1);

    const invalid = setupEngine({
      0: { battleArea: [{ card: "BT10-064", as: "nonTsBase" }], hand: [{ card: CARD_ID, as: "bacchusmon" }] },
    });
    invalid.state.memory = 4;
    await invalid.ready();
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("nonTsBase").permanentId,
        instanceId: invalid.inst("bacchusmon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 2,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(invalid.state.memory).toBe(4);
  });

  it("suspends one Digimon when any Digimon is manually played, including while Bacchusmon is suspended", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: TARGET, as: "played" }],
          battleArea: [{ card: "BT25-077", as: "bacchusmon", suspended: true }],
        },
        1: { battleArea: [{ card: HIGH, as: "opponent" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("bacchusmon").topCard.instanceId);
    await s.ready();
    s.state.memory = 3;
    const playedId = s.inst("played").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: playedId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === playedId));
    await settle();

    expect(s.state.players[0]!.battleArea.some((p) => p.isSuspended)).toBe(true);
    expect(s.state.players[0]!.battleArea.find((p) => p.topCard?.instanceId === playedId)?.isSuspended).toBe(false);
    expect(s.perm("opponent").isSuspended).toBe(false);
  });

  it("must delete the opponent's lowest-DP Digimon after an effect-play even when suspend is declined", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: TARGET, as: "played" }],
          battleArea: [{ card: "BT25-077", as: "bacchusmon" }],
        },
        1: {
          battleArea: [
            { card: LOW, as: "lowest", dp: 3000 },
            { card: HIGH, as: "higher", dp: 7000 },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.playInstances([s.inst("played").instanceId], "BT25-077");

    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === LOW)).toBe(false);
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === HIGH)).toBe(true);
    expect(s.perm("bacchusmon").isSuspended).toBe(false);
  });

  it("plays exactly one TS Digimon at the 6000-DP ceiling and excludes near-matches", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT25-077", as: "bacchusmon" },
            { card: CEILING_TS, as: "validTs" },
            { card: OVER_CEILING_TS, as: "overDpTs" },
            { card: LOW, as: "nonTs" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.playInstances([s.inst("bacchusmon").instanceId], "BT25-077");

    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("validTs").instanceId)).toBe(
      true,
    );
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("overDpTs").instanceId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("nonTs").instanceId)).toBe(true);
  });

  it("reduces the hard-play cost by 5 at the exact 12-level threshold", async () => {
    const qualifying = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-077", as: "toPlay" }],
          battleArea: ["BT25-077", "BT25-077"],
        },
      },
      { autoDeclineOptional: true },
    );
    await qualifying.ready();
    qualifying.state.memory = -2;
    expect(
      qualifying.engine.applyIntent(0, { type: "playCard", instanceId: qualifying.inst("toPlay").instanceId }),
    ).toEqual({ ok: true });
    await settle(() =>
      qualifying.state.players[0]!.battleArea.some(
        (p) => p.topCard?.instanceId === qualifying.inst("toPlay").instanceId,
      ),
    );
    expect(qualifying.state.memory).toBe(-9);
  });

  it("shares the once-per-turn activation across play and digivolve events", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: TARGET, as: "manual" },
            { card: TARGET, as: "effect" },
          ],
          battleArea: [{ card: "BT25-077", as: "bacchusmon" }],
        },
        1: { battleArea: [{ card: LOW, as: "lowest", dp: 3000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("manual").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("manual").instanceId),
    );
    await settle();
    expect(s.state.players[0]!.battleArea.some((p) => p.isSuspended)).toBe(true);

    await advance(s.engine).verb.playInstances([s.inst("effect").instanceId], "BT25-077");
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === LOW)).toBe(true);
  });

  it("does not consume the once-per-turn limit when a non-effect event is declined, then deletes on an effect event", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: TARGET, as: "declined" },
            { card: TARGET, as: "effect" },
          ],
          battleArea: [{ card: "BT25-077", as: "bacchusmon" }],
        },
        1: { battleArea: [{ card: LOW, as: "lowest", dp: 3000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("declined").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("declined").instanceId),
    );
    await settle();
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === LOW)).toBe(true);

    await advance(s.engine).verb.playInstances([s.inst("effect").instanceId], "BT25-077");
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === LOW)).toBe(false);
  });

  it("fires on an effect digivolution into Bacchusmon, plays a TS Digimon, and deletes lowest DP", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT25-077", as: "bacchusmon" },
            { card: TARGET, as: "tsTarget" },
          ],
          battleArea: [{ card: "BT25-071", as: "base" }],
        },
        1: { battleArea: [{ card: LOW, as: "lowest", dp: 3000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.digivolveFromInstance(s.perm("base").permanentId, s.inst("bacchusmon").instanceId);
    await settle(() => s.perm("base").topCard?.cardId === "BT25-077");

    expect(s.perm("base").topCard?.cardId).toBe("BT25-077");
    expect(s.perm("base").stack.map((card) => card.cardId)).toContain("BT25-071");
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === TARGET)).toBe(true);
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === LOW)).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Reboot")).toBe(false);
  });
});

describe("BT25-077 Bacchusmon — KB Q&A rulings", () => {
  const onBoard = (s: EngineSetup, seat: 0 | 1, instanceId: string) =>
    s.state.players[seat]!.battleArea.some((p) => p.topCard?.instanceId === instanceId);
  const allTurnsActivations = (s: EngineSetup) =>
    s.events.filter(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === CARD_ID && event.timing !== "OnPlay",
    ).length;

  it.each([
    ["from the hand", false],
    ["by an effect", true],
  ] as const)(
    "triggers its [All Turns] effect when this Bacchusmon itself is played %s (Q6375)",
    async (_route, byEffect) => {
      const s = setupEngine(
        {
          0: { hand: [{ card: CARD_ID, as: "bacchusmon" }], battleArea: [{ card: LOW, as: "own" }] },
          1: { battleArea: [{ card: LOW, as: "lowest", dp: 3000 }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      const bacchusmonId = s.inst("bacchusmon").instanceId;

      s.state.memory = 12;
      const played = byEffect
        ? await advance(s.engine)
            .verb.playInstances([bacchusmonId], "BT26-032")
            .then(() => ({ ok: true }))
        : s.engine.applyIntent(0, { type: "playCard", instanceId: bacchusmonId });
      expect(played).toEqual({ ok: true });
      await settle(() => onBoard(s, 0, bacchusmonId) && s.state.pendingDecision === undefined);
      await drainMicrotasks();

      expect(allTurnsActivations(s)).toBe(1);
      expect(s.state.players[0]!.battleArea.some((p) => p.isSuspended)).toBe(true);
      expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === LOW)).toBe(!byEffect);
    },
  );

  it("activates even when every Digimon on the field is already suspended (Q6376)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "evolution" }],
          battleArea: [
            { card: CARD_ID, as: "bacchusmon", suspended: true },
            { card: "BT25-071", as: "base", suspended: true },
          ],
        },
        1: { battleArea: [{ card: LOW, as: "lowest", dp: 3000, suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["play"] },
    );
    await s.ready();

    await advance(s.engine).verb.digivolveFromInstance(s.perm("base").permanentId, s.inst("evolution").instanceId);
    await settle(() => s.perm("base").topCard.cardId === CARD_ID && s.state.pendingDecision === undefined);
    await drainMicrotasks();

    expect(allTurnsActivations(s)).toBeGreaterThanOrEqual(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("can't activate again for an effect play after its [Once Per Turn] was used on an ordinary play (Q6377)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: TARGET, as: "manual" },
            { card: TARGET, as: "effect" },
          ],
          battleArea: [{ card: CARD_ID, as: "bacchusmon" }],
        },
        1: { battleArea: [{ card: LOW, as: "lowest", dp: 3000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("manual").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => onBoard(s, 0, s.inst("manual").instanceId) && s.state.pendingDecision === undefined);
    await drainMicrotasks();
    expect(allTurnsActivations(s)).toBe(1);

    await advance(s.engine).verb.playInstances([s.inst("effect").instanceId], "BT26-032");
    await drainMicrotasks();

    expect(allTurnsActivations(s)).toBe(1);
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === LOW)).toBe(true);
  });

  it("must delete the opponent's lowest DP Digimon when an effect plays a Digimon (Q6378)", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: TARGET, as: "played" }], battleArea: [{ card: CARD_ID, as: "bacchusmon" }] },
        1: {
          battleArea: [
            { card: LOW, as: "lowest", dp: 3000 },
            { card: HIGH, as: "higher", dp: 7000 },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.playInstances([s.inst("played").instanceId], "BT26-032");
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.battleArea.map((p) => p.topCard?.cardId)).toEqual([HIGH]);
    expect(
      s.decisions
        .filter(
          ({ req }) =>
            req.sourceCardId === CARD_ID && req.kind === "chooseTargets" && req.options?.purpose === "optionalTarget",
        )
        .map(({ req }) => req.promptText),
    ).toHaveLength(1);
  });

  it("stays available after declining it for an ordinary play, then must delete on an effect play (Q6946)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: TARGET, as: "declined" },
            { card: TARGET, as: "firstEffect" },
            { card: TARGET, as: "secondEffect" },
          ],
          battleArea: [{ card: CARD_ID, as: "bacchusmon" }],
        },
        1: {
          battleArea: [
            { card: LOW, as: "lowest", dp: 3000 },
            { card: HIGH, as: "higher", dp: 7000 },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("declined").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => onBoard(s, 0, s.inst("declined").instanceId) && s.state.pendingDecision === undefined);
    await drainMicrotasks();
    expect(s.state.players[1]!.battleArea).toHaveLength(2);

    // Declining the suspend on an effect play still processes the delete and spends [Once Per Turn].
    await advance(s.engine).verb.playInstances([s.inst("firstEffect").instanceId], "BT26-032");
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard?.cardId)).toEqual([HIGH]);

    await advance(s.engine).verb.playInstances([s.inst("secondEffect").instanceId], "BT26-032");
    await settle(() => s.state.pendingDecision === undefined);
    await drainMicrotasks();
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard?.cardId)).toEqual([HIGH]);
  });

  it("stacks its own 5 reduction with BT26-032 Ceresmon's 5 when that effect plays it (Q7002)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-059", as: "ceresmon" },
            { card: "BT1-080", as: "levelSix" },
          ],
          hand: [
            { card: "BT26-032", as: "evolution" },
            { card: CARD_ID, as: "bacchusmon" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
        declinePrompts: ["Suspend 2"],
      },
    );
    preferred.push(s.perm("levelSix").permanentId, s.inst("bacchusmon").instanceId);
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("ceresmon").permanentId,
        instanceId: s.inst("evolution").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => onBoard(s, 0, s.inst("bacchusmon").instanceId) && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(0);
  });
});
