import "../index.js";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import "./BT13-007.js";
import "./BT13-110.js";
import "./BT13-020.js";
import "../BT4/BT4-025.js";
import "../BT17/BT17-012.js";
import "../BT23/BT23-102.js";
import "./BT13-093.js";
import "./BT13-112.js";
import "../BT14/BT14-088.js";
import "../BT17/BT17-078.js";
import "../ST1/ST1-10.js";
import "../EX13/EX13-014.js";
import "../BT27/BT27-068.js";

async function playFromHand(s: ReturnType<typeof setupEngine>, alias: string, battleAreaSize: number): Promise<number> {
  const memoryBefore = s.state.memory;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst(alias).instanceId })).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.battleArea.length === battleAreaSize);
  return memoryBefore - s.state.memory;
}

async function passToNextOwnMain(
  s: ReturnType<typeof setupEngine>,
  ownTurnInFlight: Promise<void>,
  memory: number,
): Promise<{ ownTurn: Promise<void> }> {
  const turns = advance(s.engine);
  turns.endMainPhaseIfOpen(0);
  await ownTurnInFlight;
  s.state.turnSeat = 1;
  s.state.memory = 0;
  const opponentTurn = s.engine.runOneTurn();
  await turns.waitForMainPhase(1);
  turns.endMainPhaseIfOpen(1);
  await opponentTurn;
  s.state.turnSeat = 0;
  s.state.memory = memory;
  const ownTurn = s.engine.runOneTurn();
  await turns.waitForMainPhase(0);
  return { ownTurn };
}

describe("BT13-007 King Drasil_7D6", () => {
  it("#5176: a Royal Knight ACE played during Main remains until the next own Main, with no Overflow on placement", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil" },
          hand: [{ card: "BT20-060", as: "ace" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { deck: ["BT1-009", "BT1-009"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoOrderCards: true,
      },
    );
    s.state.memory = 10;
    s.state.isFirstPlayersFirstTurn = false;
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const aceId = s.inst("ace").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: aceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === aceId) &&
        s.state.pendingDecision === undefined &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    expect(s.perm("drasil").stack.some((c) => c.instanceId === aceId)).toBe(false);
    const { ownTurn } = await passToNextOwnMain(s, firstTurn, 5);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === aceId)).toBe(false);
    expect(s.perm("drasil").stack.some((c) => c.instanceId === aceId)).toBe(true);
    expect(s.state.memory).toBe(5);
    expect(s.events.filter((e) => e.kind === "memoryChanged" && e.reason === "overflow")).toHaveLength(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
  });

  it("prevents its controller's Digimon from digivolving while it is in breeding", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT13-007", as: "drasil" },
        battleArea: [{ card: "BT1-045", as: "base" }],
        hand: [{ card: "BT18-036", as: "evolver" }],
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolver").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.perm("base").topCard.cardId).toBe("BT1-045");
  });

  it("reduces one Royal Knight play by 4 plus its source count, then spends the once-per-turn budget", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil", under: ["BT1-001", "BT1-002"] },
          hand: [
            { card: "BT13-040", as: "firstKnight" },
            { card: "BT13-040", as: "secondKnight" },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstKnight").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    expect(s.state.memory).toBe(9);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondKnight").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    expect(s.state.memory).toBe(2);
  });

  it("reduces a Royal Knight play by 4 while it has no digivolution cards", async () => {
    expect(await memoryAfterPlayingMagnamon([])).toBe(10 - (7 - 4));
  });

  it("may decline the Royal Knight play-cost reduction", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil", under: ["BT1-001", "BT1-002"] },
          hand: [{ card: "BT13-040", as: "knight" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("knight").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    expect(s.state.memory).toBe(3);
  });

  it("must place the top Digi-Egg and every battle-area Royal Knight under itself at Start of Main", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil" },
          eggDeck: [{ card: "BT1-001", as: "egg" }],
          battleArea: [
            { card: "AD1-008", as: "knight" },
            { card: "BT1-015", as: "nonKnight" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    const eggId = s.inst("egg").instanceId;
    const knightId = s.perm("knight").topCard.instanceId;

    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("drasil"));
    await settle(() => s.perm("drasil").stack.some((card) => card.instanceId === eggId));

    expect(s.perm("drasil").stack.map((card) => card.instanceId)).toEqual(expect.arrayContaining([eggId, knightId]));
    expect(s.perm("drasil").stack.find((card) => card.instanceId === eggId)?.faceUp).toBe(true);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
      s.perm("nonKnight").permanentId,
    ]);
  });

  it("gains memory only once when Royal Knight Options enter battle with King Drasil inherited", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "host", under: ["BT13-007"] },
          hand: [
            { card: "BT13-110", as: "firstOption" },
            { card: "BT13-110", as: "secondOption" },
          ],
          deck: ["BT1-010", "BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT13-110"));
    await settle();
    expect(s.state.memory).toBe(5);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () => s.state.players[0]!.battleArea.filter((permanent) => permanent.topCard.cardId === "BT13-110").length === 2,
    );
    expect(s.state.memory).toBe(-1);
  });

  it("resets the Royal Knight play reduction on the next own turn", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil", under: ["BT1-001"] },
          hand: [
            { card: "BT13-040", as: "firstKnight" },
            { card: "BT13-040", as: "sameTurnKnight" },
            { card: "BT13-040", as: "nextTurnKnight" },
          ],
          deck: Array.from({ length: 10 }, () => "BT1-009"),
        },
        1: { hand: ["BT13-021"], deck: Array.from({ length: 10 }, () => "BT1-009") },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 10;
    await s.ready();

    const initialOwnTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstKnight").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    expect(s.state.memory).toBe(8);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("sameTurnKnight").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    expect(s.state.memory).toBe(1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await initialOwnTurn;

    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;
    const nextOwnTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);

    // Start of Main placed both Magnamon under King Drasil: 3 sources reduce the 7 cost to 0.
    expect(s.perm("drasil").stack).toHaveLength(3);
    const memoryBeforeNextKnight = s.state.memory;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("nextTurnKnight").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    expect(s.state.memory).toBe(memoryBeforeNextKnight);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextOwnTurn;
  });

  it("resets the inherited Royal Knight Option memory trigger on the next own turn", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "host", under: ["BT13-007"] },
          hand: [
            { card: "BT13-110", as: "firstOption" },
            { card: "BT13-110", as: "sameTurnOption" },
            { card: "BT13-110", as: "nextTurnOption" },
          ],
          deck: Array.from({ length: 10 }, () => "BT1-009"),
        },
        1: { hand: ["BT13-021"], deck: Array.from({ length: 10 }, () => "BT1-009") },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 10;
    await s.ready();

    const initialOwnTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    expect(s.state.memory).toBe(5);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("sameTurnOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    expect(s.state.memory).toBe(-1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await initialOwnTurn;

    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;
    const nextOwnTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);

    const memoryBeforeNextOption = s.state.memory;
    expect(memoryBeforeNextOption).toBe(3);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("nextTurnOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 3);
    expect(s.state.memory).toBe(memoryBeforeNextOption - 5);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextOwnTurn;
  });

  // Discord bug 1554297556551340062, match dd487753-8aff-4566-ae00-154cddc7dfe3: an earlier
  // payment window left the reducer registered with its old source count.
  it("counts both same-name Digi-Egg sources after an earlier play registered the reducer", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil" },
          eggDeck: ["BT13-007", "BT13-007"],
          hand: [
            { card: "BT1-010", as: "filler" },
            { card: "EX13-014", as: "jesmon" },
          ],
          deck: Array.from({ length: 10 }, () => "BT1-009"),
        },
        1: { deck: Array.from({ length: 10 }, () => "BT1-009") },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.perm("drasil").stack).toHaveLength(1);
    expect(await playFromHand(s, "filler", 1)).toBe(3);
    const { ownTurn: secondTurn } = await passToNextOwnMain(s, firstTurn, 10);

    expect(s.perm("drasil").stack.map((card) => card.cardId)).toEqual(["BT13-007", "BT13-007"]);
    expect(await playFromHand(s, "jesmon", 2)).toBe(6);
    advance(s.engine).endMainPhaseIfOpen(0);
    await secondTurn;
  });

  it("counts three King Drasil eggs and a Royal Knight source after an earlier reduced play", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil", under: ["BT13-007"] },
          eggDeck: ["BT13-007", "BT13-007"],
          hand: [
            { card: "EX13-014", as: "firstJesmon" },
            { card: "BT1-010", as: "filler" },
            { card: "EX13-014", as: "secondJesmon" },
          ],
          deck: Array.from({ length: 10 }, () => "BT1-009"),
        },
        1: { deck: Array.from({ length: 10 }, () => "BT1-009") },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.perm("drasil").stack).toHaveLength(2);
    expect(await playFromHand(s, "firstJesmon", 1)).toBe(6);
    expect(await playFromHand(s, "filler", 2)).toBe(3);
    const { ownTurn: secondTurn } = await passToNextOwnMain(s, firstTurn, 10);

    expect(
      s
        .perm("drasil")
        .stack.map((card) => card.cardId)
        .sort(),
    ).toEqual(["BT13-007", "BT13-007", "BT13-007", "EX13-014"]);
    expect(await playFromHand(s, "secondJesmon", 2)).toBe(4);
    advance(s.engine).endMainPhaseIfOpen(0);
    await secondTurn;
  });

  it("does not reduce the use cost of a Royal Knight DUAL card used as an Option, keeping its once-per-turn budget", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil" },
          hand: [
            { card: "BT27-068", as: "dual" },
            { card: "BT13-040", as: "knight" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT2-064", as: "big" }], deck: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Arts Digivolve"] },
    );
    s.state.memory = 10;
    await s.ready();

    const dualId = s.inst("dual").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: dualId, useAs: "option" })).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.trash.some((card) => card.instanceId === dualId) && !s.state.pendingDecision,
    );
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "BT13-007")).toEqual([]);
    expect(s.state.memory).toBe(5);
    expect(s.state.players[1]!.deck[0]!.cardId).toBe("BT2-064");

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("knight").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1 && !s.state.pendingDecision);
    expect(s.state.memory).toBe(5 - (7 - 4));
  });
});

function digivolveOnto(s: EngineSetup, baseAlias: string, cardAlias: string, route: DigivolveRoute = {}) {
  return s.engine.applyIntent(0, {
    type: "digivolve",
    permanentId: s.perm(baseAlias).permanentId,
    instanceId: s.inst(cardAlias).instanceId,
    ...route,
  });
}

type DigivolveRoute = { useAlternateCost?: boolean; alternateRequirementIndex?: number };

async function memoryAfterPlayingMagnamon(digivolutionCards: string[]): Promise<number> {
  const s = setupEngine(
    {
      0: {
        breeding: { card: "BT13-007", as: "drasil", under: digivolutionCards },
        hand: [{ card: "BT13-040", as: "knight" }],
      },
    },
    { autoAcceptOptional: true },
  );
  s.state.memory = 10;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("knight").instanceId })).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.battleArea.length === 1);
  return s.state.memory;
}

describe("BT13-007 King Drasil_7D6 — KB Q&A rulings", () => {
  it("also forbids DNA digivolution and burst digivolution (Q2259)", async () => {
    function layDnaBoard(withDrasil: boolean): EngineSetup {
      return setupEngine(
        {
          0: {
            ...(withDrasil ? { breeding: { card: "BT13-007", as: "drasil" } } : {}),
            battleArea: [
              { card: "ST10-05", as: "yellow" },
              { card: "BT23-067", as: "purple" },
            ],
            hand: [{ card: "BT23-102", as: "mastemon" }],
            deck: ["BT1-009", "BT1-010", "BT1-011"],
          },
        },
        { autoDeclineOptional: true },
      );
    }
    function dnaDigivolve(s: EngineSetup) {
      return s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("yellow").permanentId, s.perm("purple").permanentId],
        instanceId: s.inst("mastemon").instanceId,
      });
    }
    function layBurstBoard(withDrasil: boolean): EngineSetup {
      return setupEngine(
        {
          0: {
            ...(withDrasil ? { breeding: { card: "BT13-007", as: "drasil" } } : {}),
            battleArea: [
              { card: "BT4-020", as: "shineGreymon" },
              { card: "BT12-092", as: "marcus" },
            ],
            hand: [{ card: "BT13-020", as: "burstMode" }],
            deck: ["BT1-009", "BT1-010", "BT1-011"],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
    }

    const lockedDna = layDnaBoard(true);
    lockedDna.state.memory = 5;
    await lockedDna.ready();
    expect(dnaDigivolve(lockedDna)).toMatchObject({ ok: false });
    expect(lockedDna.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT23-102");
    expect(lockedDna.state.players[0]!.battleArea).toHaveLength(2);

    const lockedBurst = layBurstBoard(true);
    lockedBurst.state.memory = 5;
    await lockedBurst.ready();
    expect(digivolveOnto(lockedBurst, "shineGreymon", "burstMode", { useAlternateCost: true })).toMatchObject({
      ok: false,
    });
    expect(lockedBurst.perm("shineGreymon").topCard.cardId).toBe("BT4-020");
    expect(lockedBurst.state.memory).toBe(5);

    const freeDna = layDnaBoard(false);
    freeDna.state.memory = 5;
    await freeDna.ready();
    expect(dnaDigivolve(freeDna)).toEqual({ ok: true });

    const freeBurst = layBurstBoard(false);
    freeBurst.state.memory = 5;
    await freeBurst.ready();
    expect(digivolveOnto(freeBurst, "shineGreymon", "burstMode", { useAlternateCost: true })).toEqual({ ok: true });
    await settle(() => freeBurst.perm("shineGreymon").topCard.cardId === "BT13-020");
  });

  it("forbids a Tamer digivolving as if it is a level 3 Digimon (Q2260)", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT13-007", as: "drasil" },
        battleArea: [
          { card: "BT1-086", as: "blueTamer" },
          { card: "BT1-029", as: "rookie" },
        ],
        hand: [
          { card: "BT4-025", as: "tamerLobomon" },
          { card: "BT4-025", as: "rookieLobomon" },
        ],
        deck: ["BT1-009", "BT1-010", "BT1-011"],
      },
    });
    s.state.memory = 5;
    await s.ready();

    expect(digivolveOnto(s, "rookie", "rookieLobomon")).toMatchObject({ ok: false });
    expect(digivolveOnto(s, "blueTamer", "tamerLobomon")).toMatchObject({ ok: false });
    expect(s.perm("blueTamer").topCard.cardId).toBe("BT1-086");
    expect(s.state.memory).toBe(5);
  });

  it("still lets a Tamer digivolve through a printed requirement that digivolves from a Tamer (Q2261)", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT13-007", as: "drasil" },
        battleArea: [
          { card: "BT12-088", as: "takuya" },
          { card: "BT1-029", as: "rookie" },
        ],
        hand: [
          { card: "BT17-012", as: "burningGreymon" },
          { card: "BT4-025", as: "rookieLobomon" },
        ],
        deck: ["BT1-009", "BT1-010", "BT1-011"],
      },
    });
    s.state.memory = 5;
    await s.ready();

    expect(digivolveOnto(s, "rookie", "rookieLobomon")).toMatchObject({ ok: false });
    expect(s.perm("rookie").topCard.cardId).toBe("BT1-029");

    expect(digivolveOnto(s, "takuya", "burningGreymon", { alternateRequirementIndex: 0 })).toEqual({ ok: true });
    await settle(() => s.perm("takuya").topCard.cardId === "BT17-012");
    expect(s.state.memory).toBe(3);
    expect(s.perm("takuya").stack.map((card) => card.cardId)).toEqual(["BT12-088"]);
  });

  it("adds 1 to the play cost reduction of 4 for each of its digivolution cards (Q2262)", async () => {
    expect(await memoryAfterPlayingMagnamon(["BT1-001"])).toBe(10 - (7 - 5));
    expect(await memoryAfterPlayingMagnamon(["BT1-001", "BT1-002"])).toBe(10 - (7 - 6));
    expect(await memoryAfterPlayingMagnamon(["BT1-001", "BT1-002", "BT1-003"])).toBe(10 - 0);
  });

  it("cannot skip revealing the Digi-Egg and placing its Royal Knights at Start of Main (Q2263)", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil" },
          eggDeck: [{ card: "BT1-001", as: "egg" }],
          battleArea: [{ card: "AD1-008", as: "knight" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const eggId = s.inst("egg").instanceId;
    const knightId = s.perm("knight").topCard.instanceId;

    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("drasil"));
    await settle(() => s.perm("drasil").stack.some((card) => card.instanceId === knightId));

    expect(s.decisions.filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT13-007")).toEqual([]);
    expect(s.perm("drasil").stack.map((card) => card.instanceId)).toEqual(expect.arrayContaining([eggId, knightId]));
    expect(s.perm("drasil").stack.find((card) => card.instanceId === eggId)?.faceUp).toBe(true);
    expect(s.state.players[0]!.eggDeck).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("lets its controller order the new bottom digivolution cards beneath the existing ones (Q2264)", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil", under: [{ card: "BT1-002", as: "existing" }] },
          eggDeck: [{ card: "BT1-001", as: "egg" }],
          battleArea: [
            { card: "AD1-008", as: "gallantmon" },
            { card: "BT13-040", as: "magnamon" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: false },
    );
    const eggId = s.inst("egg").instanceId;
    const gallantmonId = s.perm("gallantmon").topCard.instanceId;
    const magnamonId = s.perm("magnamon").topCard.instanceId;
    const existingId = s.inst("existing").instanceId;

    const firing = advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("drasil"));
    await settle(() => s.decisions.some(({ req }) => req.kind === "orderCards"));
    const orderRequest = s.decisions.find(({ req }) => req.kind === "orderCards")!;
    expect(orderRequest.seat).toBe(0);
    expect(orderRequest.req.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([eggId, gallantmonId, magnamonId]),
    );
    const chosenBottomFirst = [magnamonId, eggId, gallantmonId];
    expect(orderRequest.req.options?.candidateInstanceIds).not.toEqual(chosenBottomFirst);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: orderRequest.req.decisionId,
        response: { kind: "orderCards", order: chosenBottomFirst },
      }),
    ).toEqual({ ok: true });
    await firing;
    await settle(() => s.perm("drasil").stack.length === 4);

    expect(s.perm("drasil").stack.map((card) => card.instanceId)).toEqual([...chosenBottomFirst, existingId]);
  });

  it("does not process <Overflow> when Start of Main places an Omnimon ACE from the battle area under it (Q2265)", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", as: "drasil" },
          eggDeck: [{ card: "BT1-001", as: "egg" }],
          battleArea: [{ card: "BT17-078", as: "omnimonAce" }],
        },
      },
      { autoSelectCards: true, autoOrderCards: true },
    );
    const aceId = s.perm("omnimonAce").topCard.instanceId;
    s.state.memory = 5;

    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("drasil"));
    await settle(() => s.perm("drasil").stack.some((card) => card.instanceId === aceId));
    await settle();

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.events.filter((event) => event.kind === "memoryChanged" && event.reason === "overflow")).toEqual([]);
    expect(s.state.memory).toBe(5);
  });

  it("lets Omekamon's On Deletion skip placing a Royal Knight from hand under it (Q2340)", async () => {
    async function deleteOmekamon(optionalChoice: "accept" | "decline") {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT13-093", as: "omekamon" }],
            breeding: { card: "BT13-007", as: "drasil" },
            hand: [{ card: "BT13-040", as: "royalKnight" }],
          },
          1: { battleArea: [{ card: "ST1-10", as: "phoenix", suspended: true }] },
        },
        optionalChoice === "accept"
          ? { autoAcceptOptional: true, autoSelectCards: true }
          : { autoDeclineOptional: true, autoSelectCards: true },
      );
      const omekamonId = s.perm("omekamon").topCard.instanceId;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("omekamon").permanentId,
          target: { kind: "permanent", permanentId: s.perm("phoenix").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === omekamonId));
      await settle();
      return s;
    }

    const declined = await deleteOmekamon("decline");
    const declinedKnightId = declined.inst("royalKnight").instanceId;
    expect(declined.state.pendingDecision).toBeUndefined();
    expect(declined.state.players[0]!.hand.map((card) => card.instanceId)).toContain(declinedKnightId);
    expect(declined.perm("drasil").stack).toHaveLength(0);

    const accepted = await deleteOmekamon("accept");
    const acceptedKnightId = accepted.inst("royalKnight").instanceId;
    expect(accepted.perm("drasil").stack.map((card) => card.instanceId)).toEqual([acceptedKnightId]);
  });

  it("processes <Overflow> when Omnimon's On Play trashes it with an Omnimon ACE among its digivolution cards (Q2369)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT13-112", as: "omnimon" }],
          breeding: {
            card: "BT13-007",
            as: "drasil",
            under: [
              { card: "BT17-078", as: "firstAce" },
              { card: "BT17-078", as: "secondAce" },
            ],
          },
        },
      },
      { autoAcceptOptional: true, autoChooseOption: true, preferOptionIndex: 1, autoSelectCards: true },
    );
    const drasilId = s.perm("drasil").topCard.instanceId;
    const aceIds = [s.inst("firstAce").instanceId, s.inst("secondAce").instanceId];
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("omnimon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === drasilId));
    await settle();

    const playedAces = s.state.players[0]!.battleArea.filter((permanent) =>
      aceIds.includes(permanent.topCard.instanceId),
    );
    const trashedAces = s.state.players[0]!.trash.filter((card) => aceIds.includes(card.instanceId));
    expect(playedAces).toHaveLength(1);
    expect(trashedAces).toHaveLength(1);
    const overflowCharges = s.events.flatMap((event) =>
      event.kind === "memoryChanged" && event.reason === "overflow" ? [event.from - event.to] : [],
    );
    expect(overflowCharges).toEqual([5]);
  });

  it("cannot be moved from breeding to the battle area by Gennai because it has no DP (Q2463)", async () => {
    async function attackIntoGennai(breedingCard: "BT13-007" | "BT14-007") {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT14-088", as: "gennai" }],
            breeding: { card: breedingCard, as: "breedingEgg" },
            security: ["BT1-085"],
          },
          1: { battleArea: [{ card: "BT14-015", as: "attacker" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = 1;
      await s.ready();
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.security.length === 0 ||
          s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === breedingCard),
      );
      await settle();
      return s;
    }

    const withDrasil = await attackIntoGennai("BT13-007");
    expect(withDrasil.state.players[0]!.breeding?.topCard.cardId).toBe("BT13-007");
    expect(withDrasil.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT13-007")).toBe(
      false,
    );

    const withDpBearingDigimon = await attackIntoGennai("BT14-007");
    expect(withDpBearingDigimon.state.players[0]!.breeding).toBeUndefined();
    expect(
      withDpBearingDigimon.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT14-007"),
    ).toBe(true);
    expect(withDpBearingDigimon.perm("gennai").isSuspended).toBe(true);
  });
});

describe("Discord October 5 report regressions", () => {
  it("1556732255148179569: King Drasil never offers Your Turn reduction for Omekamon's opponent-turn free play", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 6000 }], deck: ["BT1-009"] },
        1: {
          breeding: { card: "BT13-007", as: "drasil", under: ["BT20-102"] },
          battleArea: [{ card: "EX11-053", as: "omeka", suspended: true }],
          security: ["BT1-009"],
          hand: ["BT1-009", { card: "BT13-040", as: "prime" }],
          deck: ["BT1-009"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        declinePrompts: ["reduce the play cost by 4"],
      },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("prime").instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.battleArea.some((p) => p.topCard.cardId === "BT13-040") &&
        s.state.pendingDecision === undefined,
    );
    s.state.turnSeat = 0;
    s.state.turnCount++;
    s.state.memory = 0;
    const reducers = advance(s.engine).ledgers.subTriggers;
    expect(
      reducers.potentialInteractiveReductionFor("wouldBePlayed", 1, s.perm("prime"), getCardDefinition("BT13-040")!),
    ).toBe(0);
    expect(
      reducers.hasApplicablePlayReductions(1, s.perm("prime"), getCardDefinition("BT13-040")!, {
        hasFired: () => false,
        markFired: () => {},
      }),
    ).toBe(false);
    const priorDecisions = s.decisions.length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("omeka").permanentId },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    await settle(
      () =>
        s.events.some((e) => e.kind === "cardPlayed" && e.cardId === "BT20-102") &&
        s.state.pendingDecision === undefined,
    );
    expect(
      s.decisions.slice(priorDecisions).filter(({ req }) => req.sourceCardId === "BT13-007" && req.kind === "optional"),
    ).toEqual([]);
    expect(s.state.memory).toBe(0);
  });
});
