import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./LM-028.js";
import "#api/cards/BT19/BT19-017";
import "../BT12/BT12-024.js";
import "../BT13/BT13-033.js";
import { describeScrambleRulings } from "./scrambleRulings.testSupport.js";

async function openAfterStartOfTurn(s: ReturnType<typeof setupEngine>): Promise<{ turn: Promise<void> }> {
  const turn = s.engine.runOneTurn();
  const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
  for (let i = 0; i < 500 && !mainPhase.isOpen; i += 1) await Promise.resolve();
  expect(mainPhase.isOpen).toBe(true);
  return { turn };
}

async function closeTurn(s: ReturnType<typeof setupEngine>, turn: Promise<void>): Promise<void> {
  const mainPhase = (s.engine as unknown as { mainPhase: { isOpen: boolean } }).mainPhase;
  if (mainPhase.isOpen) {
    const ended = s.engine.applyIntent(0, { type: "endPhase" });
    if (!ended.ok) throw new Error(`Could not end the Main phase: ${ended.reason}`);
  }
  await turn;
}

describe("LM-028 Blue Scramble", () => {
  it("adds Sangomon's two search cards before the single phase draw after Delay", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "LM-028", as: "option", placedByEffect: true }],
          trash: ["BT1-027", "BT19-017"],
          deck: ["BT19-017", "EX7-024", "BT1-085", "BT1-085"],
        },
        1: { battleArea: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.isFirstPlayersFirstTurn = false;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId).sort()).toEqual(
      ["EX7-024", "BT1-085", "BT19-017"].sort(),
    );
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT19-017"]);
    await closeTurn(s, turn);
  });

  it("draws only one card after two Delay effects return cards to the deck", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "LM-028", as: "first" }, { card: "LM-028", as: "second" }, "BT1-029"],
          trash: ["BT1-027", "BT1-031"],
          deck: ["BT1-085", "BT1-085"],
        },
        1: { battleArea: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.perm("first").placedByEffect = true;
    s.perm("second").placedByEffect = true;
    s.state.isFirstPlayersFirstTurn = false;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId === "LM-028")).toHaveLength(2);
    await closeTurn(s, turn);
  });

  it("Discord 1556998094070095964: accepting Delay still lets the sole rookie stay in trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "LM-028", as: "first" },
            { card: "LM-028", as: "second" },
          ],
          trash: [
            { card: "BT1-027", as: "return" },
            { card: "BT1-031", as: "rookie" },
          ],
          deck: ["BT1-085", "BT1-085"],
        },
        1: { battleArea: ["BT1-010"], deck: ["BT1-085"] },
      },
      { autoOrderTriggers: false },
    );
    await s.ready();
    s.perm("first").placedByEffect = true;
    s.perm("second").placedByEffect = true;
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const order = s.decisions.at(-1)!.req;
    const keys = order.options!.triggerKeys!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: { kind: "orderTriggers", order: keys, optionalAnswers: { [keys[0]!]: true, [keys[1]!]: false } },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const returned = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: returned.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("return").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision !== undefined || s.state.phase === "Main");
    const revive = s.decisions.at(-1)!.req;
    expect(revive.options?.candidateInstanceIds).toEqual([s.inst("rookie").instanceId]);
    expect(revive.options?.min).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: revive.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toContain(s.inst("rookie").instanceId);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["LM-028"]);
    await closeTurn(s, turn);
  });

  it("digivolves a blue Digimon from hand at a cost reduced by 3, then enters the battle area", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT1-029", as: "host" }], hand: [{ card: "LM-028", as: "option" }, "BT1-115"] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT1-115"), 2000);

    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT1-115")).toBe(true);
    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "LM-028")).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("Delay returns a blue Digimon to the deck top and then revives a small one", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "LM-028", as: "option" }], trash: ["BT1-027", "BT1-031"] },
        1: { battleArea: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    s.state.players[0]!.battleArea[0]!.placedByEffect = true;
    s.state.isFirstPlayersFirstTurn = true;
    const { turn } = await openAfterStartOfTurn(s);
    await settle(() => s.state.players[0]!.deck.length === 1, 2000);

    expect(s.state.players[0]!.deck[0]?.cardId).toBe("BT1-027");
    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT1-031")).toBe(true);
    await closeTurn(s, turn);
  });

  it("does not activate Delay when the opponent has no Digimon", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "LM-028", as: "option" }], trash: ["BT1-031"] } },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    s.state.players[0]!.battleArea[0]!.placedByEffect = true;
    s.state.isFirstPlayersFirstTurn = true;
    const { turn } = await openAfterStartOfTurn(s);

    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-031")).toBe(true);
    await closeTurn(s, turn);
  });

  it("Security plays a qualifying blue Digimon from trash and returns itself to hand", async () => {
    const s = setupEngine(
      { 0: { security: [{ card: "LM-028", as: "securityOption", faceUp: true }], trash: ["BT1-031"] } },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "LM-028"), 2000);

    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT1-031")).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "LM-028")).toBe(true);
  });

  it("Security leaves a blue Digimon above 2000 DP in the trash", async () => {
    const s = setupEngine(
      { 0: { security: [{ card: "LM-028", as: "securityOption", faceUp: true }], trash: ["BT1-027"] } },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "LM-028"), 2000);

    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT1-027")).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-027")).toBe(true);
  });

  it("matches committed metadata and publishes fully covered compiled IR", () => {
    const definition = getCardDefinition("LM-028");
    const compiled = runtimeCompiledCard("LM-028");
    expect(definition?.nameEn).toBe("Blue Scramble");
    expect(definition?.colors).toEqual(["Blue"]);
    expect(definition?.playCost).toBe(2);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled?.effects.find((effect) => effect.trigger === "StartOfYourTurn")).toMatchObject({
      keywords: [{ keyword: "Delay" }],
      condition: { kind: "opponentHas" },
    });
  });
});

describeScrambleRulings({
  cardId: "LM-028",
  name: "Blue Scramble",
  qno: {
    requirements: "Q4038",
    burstOrDna: "Q4039",
    tamer: "Q4040",
    delayWithoutTarget: "Q4041",
    delayMustReturn: "Q4042",
  },
  rookie: "BT1-029",
  champion: "BT1-115",
  ultimate: "BT1-038",
  dna: { card: "BT16-025", host: "BT1-037", partner: "BT1-071" },
  burst: { card: "BT13-033", host: "BT4-035", tamer: "BT4-093" },
  tamer: { card: "BT1-086", onto: "BT12-024" },
  smallInTrash: "BT1-031",
  offColorInTrash: "BT1-010",
});
