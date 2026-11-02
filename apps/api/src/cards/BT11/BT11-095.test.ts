import { EffectTiming, getCardDefinition, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { type EngineSetup, setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import "../BT5/BT5-087.js";
import "../BT8/BT8-094.js";
import { compiled } from "./BT11-095.js";
describe("BT11-095 Taiki, Kiriha, & Nene", () => {
  it("maps catalog facts and every printed effect to IR", () => {
    expect(getCardDefinition("BT11-095")).toMatchObject({
      cardId: "BT11-095",
      colors: ["White"],
      kinds: ["Tamer"],
      playCost: 4,
      types: ["Xros Heart", "BlueFlare", "General"],
    });
    expect(compiled.effects).toMatchObject([
      {
        trigger: "StartOfYourMainPhase",
        actions: [
          { kind: "Draw", amount: 1, cost: { kind: "place" }, optional: true, abortOnDecline: true },
          { kind: "GainMemory", amount: 1 },
        ],
      },
      { trigger: "YourTurn", actions: [{ kind: "Replacement", event: "wouldBePlayed" }] },
      { trigger: "Security", isSecurity: true, actions: [{ kind: "PlayWithoutCost" }] },
    ]);
  });

  it("places a Xros Heart card, gains memory and draws", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT11-095", as: "tamer" },
            { card: "BT1-086", as: "spare" },
          ],
          hand: [{ card: "BT10-008", as: "material" }],
          deck: [
            { card: "BT1-009", as: "normalDraw" },
            { card: "BT1-010", as: "effectDraw" },
            "BT1-011",
            "BT1-012",
            "BT1-013",
          ],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: { deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"], security: ["BT1-009"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.isFirstPlayersFirstTurn = false;
    s.state.memory = 3;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await settle(() => s.state.pendingDecision === undefined && s.perm("tamer").stack.length === 1);

    expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("material").instanceId]);
    expect(s.state.memory).toBe(4);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("normalDraw").instanceId, s.inst("effectDraw").instanceId]),
    );
    expect(s.state.players[0]!.hand).toHaveLength(2);
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.players[0]!.security).toHaveLength(5);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("does not gain memory, place a card or draw by the effect when its placement cost is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT11-095", as: "tamer" },
            { card: "BT1-086", as: "spare" },
          ],
          hand: [{ card: "BT10-008", as: "material" }],
          deck: [
            { card: "BT1-009", as: "normalDraw" },
            { card: "BT1-010", as: "effectDraw" },
            "BT1-011",
            "BT1-012",
            "BT1-013",
          ],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: { deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"], security: ["BT1-009"] },
      },
      { autoDeclineOptional: true },
    );
    s.state.isFirstPlayersFirstTurn = false;
    s.state.memory = 3;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.hand.length === 2);

    expect(s.state.memory).toBe(3);
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("material").instanceId, s.inst("normalDraw").instanceId]),
    );
    expect(s.state.players[0]!.deck).toHaveLength(4);
    expect(s.state.players[0]!.security).toHaveLength(5);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("suspends itself to use a card under another Tamer for DigiXros", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT11-095", as: "expander" },
          { card: "BT10-087", as: "otherTamer", under: [{ card: "BT10-008", as: "shoutmon" }] },
        ],
        hand: [{ card: "BT10-009", as: "xros" }],
      },
    });
    s.state.memory = 7;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("xros").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("shoutmon").instanceId],
          expanderPermanentIds: [s.perm("expander").permanentId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT10-009"));

    const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === "BT10-009")!;
    expect(played.stack.map(({ instanceId }) => instanceId)).toContain(s.inst("shoutmon").instanceId);
    expect(s.perm("otherTamer").stack).toHaveLength(0);
    expect(s.perm("expander").isSuspended).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("does not allow a card under a Digimon to be used as DigiXros material", () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT11-095", as: "expander" },
          { card: "BT10-009", as: "digimon", under: [{ card: "BT10-008", as: "shoutmon" }] },
        ],
        hand: [{ card: "BT10-009", as: "xros" }],
      },
    });
    s.state.memory = 9;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("xros").instanceId,
        digiXros: {
          materialInstanceIds: [s.inst("shoutmon").instanceId],
          expanderPermanentIds: [s.perm("expander").permanentId],
        },
      }),
    ).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.perm("expander").isSuspended).toBe(false);
  });
});

const SHOUTMON = "BT10-008";
const SHOUTMON_X4 = "BT10-009";
const OTHER_TAMER = "BT10-087";
const SKULLKNIGHTMON = "BT7-058";
const DEADLYAXEMON = "BT7-059";
const MIGHTY_AXE_MODE = "BT10-061";
const DARKKNIGHTMON = "BT10-066";
const NON_XROS_DIGIMON = "BT2-070";
const OMNIMON_ZWART = "BT5-087";
const DECK_FILLER = ["BT1-009", "BT1-010", "BT1-012", "BT1-013", "BT1-009", "BT1-010"];

describe("BT11-095 Taiki, Kiriha, & Nene — KB Q&A rulings", () => {
  async function runTurnWithBreedingMove(startingMemory: number) {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-095", as: "tamer" }],
          hand: [{ card: SHOUTMON, as: "material" }],
          breeding: { card: "BT1-009", dp: 3000, as: "mover" },
          deck: ["BT1-010", "BT1-010", "BT1-010"],
          eggDeck: ["BT1-001"],
        },
        1: {
          battleArea: [{ card: "BT8-094", as: "emperor" }, "BT1-009"],
          deck: ["BT1-010"],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = startingMemory;
    await s.ready();

    const turn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("mover").permanentId })).toEqual({
      ok: true,
    });
    return { s, turn };
  }

  const startOfMainPhaseTriggers = (s: EngineSetup) =>
    s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT11-095");

  function playShoutmonX4(s: EngineSetup, options: { expander: boolean }) {
    return s.engine.applyIntent(0, {
      type: "playCard",
      instanceId: s.inst("xros").instanceId,
      digiXros: {
        materialInstanceIds: [s.inst("shoutmon").instanceId],
        ...(options.expander ? { expanderPermanentIds: [s.perm("expander").permanentId] } : {}),
      },
    });
  }

  const playedShoutmonX4 = (s: EngineSetup) =>
    s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === SHOUTMON_X4);

  async function playFromTrashWithOmnimonZwart(trash: string[]) {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT11-095",
              as: "expander",
              under: [
                { card: SKULLKNIGHTMON, as: "skullKnightmon" },
                { card: DEADLYAXEMON, as: "deadlyAxemon" },
              ],
            },
            { card: OMNIMON_ZWART, as: "zwart" },
          ],
          trash: trash.map((card, index) => ({ card, as: `played${index}` })),
          deck: [...DECK_FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("zwart"));
    await settle(() =>
      trash.every((_card, index) =>
        s.state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard?.instanceId === s.inst(`played${index}`).instanceId,
        ),
      ),
    );

    const expanderInstanceId = s.inst("expander").instanceId;
    const expanderWasOffered = s.decisions.some(
      ({ req }) =>
        req.kind === "selectCards" && req.options?.candidateInstanceIds?.includes(expanderInstanceId) === true,
    );
    const underExpander = s.perm("expander").stack.map((card) => card.instanceId);
    const materialIds = [s.inst("skullKnightmon").instanceId, s.inst("deadlyAxemon").instanceId];
    return { s, expanderWasOffered, underExpander, materialIds };
  }

  it("does not activate [Start of Your Main Phase] when the memory crossed to the opponent before the main phase (Q2124)", async () => {
    const crossed = await runTurnWithBreedingMove(1);
    await crossed.turn;

    const phases = crossed.s.events.flatMap((event) => (event.kind === "phaseChanged" ? [event.phase] : []));
    expect(crossed.s.state.memory).toBe(-1);
    expect(phases).not.toContain(Phase.Main);
    expect(startOfMainPhaseTriggers(crossed.s)).toHaveLength(0);
    expect(crossed.s.perm("tamer").stack).toHaveLength(0);
    expect(crossed.s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(
      crossed.s.inst("material").instanceId,
    );

    const control = await runTurnWithBreedingMove(3);
    await advance(control.s.engine).waitForMainPhase(0);
    await settle(() => control.s.state.pendingDecision === undefined && control.s.perm("tamer").stack.length === 1);
    expect(startOfMainPhaseTriggers(control.s).length).toBeGreaterThan(0);
    expect(control.s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual([
      control.s.inst("material").instanceId,
    ]);
    advance(control.s.engine).endMainPhaseIfOpen(0);
    await control.turn;
  });

  it("lets a DigiXros use a Digimon card placed under a Tamer, which is not possible without its effect (Q2125)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT11-095", as: "expander", under: [{ card: SHOUTMON, as: "shoutmon" }] }],
        hand: [{ card: SHOUTMON_X4, as: "xros" }],
      },
    });
    s.state.memory = 7;
    await s.ready();

    expect(playShoutmonX4(s, { expander: false })).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.perm("expander").stack).toHaveLength(1);

    expect(playShoutmonX4(s, { expander: true })).toEqual({ ok: true });
    await settle(() => playedShoutmonX4(s) !== undefined);

    expect(playedShoutmonX4(s)!.stack.map(({ instanceId }) => instanceId)).toContain(s.inst("shoutmon").instanceId);
    expect(s.perm("expander").stack).toHaveLength(0);
    expect(s.perm("expander").isSuspended).toBe(true);
  });

  it("also lets a DigiXros use cards placed under a Tamer other than this Tamer (Q2126)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT11-095", as: "expander" },
          { card: OTHER_TAMER, as: "otherTamer", under: [{ card: SHOUTMON, as: "shoutmon" }] },
        ],
        hand: [{ card: SHOUTMON_X4, as: "xros" }],
      },
    });
    s.state.memory = 7;
    await s.ready();

    expect(playShoutmonX4(s, { expander: false })).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.perm("otherTamer").stack).toHaveLength(1);

    expect(playShoutmonX4(s, { expander: true })).toEqual({ ok: true });
    await settle(() => playedShoutmonX4(s) !== undefined);

    expect(playedShoutmonX4(s)!.stack.map(({ instanceId }) => instanceId)).toContain(s.inst("shoutmon").instanceId);
    expect(s.perm("otherTamer").stack).toHaveLength(0);
    expect(s.perm("otherTamer").isSuspended).toBe(false);
    expect(s.perm("expander").isSuspended).toBe(true);
  });

  it("does not let a DigiXros use the digivolution cards of a Digimon that digivolved from a Tamer (Q2127)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT11-095", as: "expander" },
          {
            card: "BT1-010",
            as: "digivolvedTamer",
            under: [OTHER_TAMER, { card: SHOUTMON, as: "shoutmon" }],
          },
        ],
        hand: [{ card: SHOUTMON_X4, as: "xros" }],
      },
    });
    s.state.memory = 9;
    await s.ready();

    expect(playShoutmonX4(s, { expander: true })).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.perm("expander").isSuspended).toBe(false);
    expect(s.perm("digivolvedTamer").stack.map(({ instanceId }) => instanceId)).toContain(
      s.inst("shoutmon").instanceId,
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("xros").instanceId]);

    const control = setupEngine({
      0: {
        battleArea: [
          { card: "BT11-095", as: "expander" },
          { card: OTHER_TAMER, as: "tamer", under: [{ card: SHOUTMON, as: "shoutmon" }] },
        ],
        hand: [{ card: SHOUTMON_X4, as: "xros" }],
      },
    });
    control.state.memory = 9;
    await control.ready();
    expect(playShoutmonX4(control, { expander: true })).toEqual({ ok: true });
  });

  it("cannot activate when 2 Digimon cards with DigiXros requirements would be played at the same time by an effect (Q2128)", async () => {
    const single = await playFromTrashWithOmnimonZwart([MIGHTY_AXE_MODE]);
    expect(single.expanderWasOffered).toBe(true);
    expect(single.s.perm("expander").isSuspended).toBe(true);
    expect(single.underExpander).toEqual([]);

    const pair = await playFromTrashWithOmnimonZwart([MIGHTY_AXE_MODE, DARKKNIGHTMON]);
    expect(pair.expanderWasOffered).toBe(false);
    expect(pair.s.perm("expander").isSuspended).toBe(false);
    expect(pair.underExpander).toEqual(pair.materialIds);
  });

  it("cannot activate when 1 DigiXros Digimon and 1 Digimon without DigiXros requirements would be played at the same time by an effect (Q2129)", async () => {
    const single = await playFromTrashWithOmnimonZwart([MIGHTY_AXE_MODE]);
    expect(single.expanderWasOffered).toBe(true);
    expect(single.underExpander).toEqual([]);

    const mixed = await playFromTrashWithOmnimonZwart([MIGHTY_AXE_MODE, NON_XROS_DIGIMON]);
    expect(mixed.expanderWasOffered).toBe(false);
    expect(mixed.s.perm("expander").isSuspended).toBe(false);
    expect(mixed.underExpander).toEqual(mixed.materialIds);
  });
});
