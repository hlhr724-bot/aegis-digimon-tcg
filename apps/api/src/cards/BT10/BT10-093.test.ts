import { describe, it, expect } from "vitest";
import { GameState, PlayerState, Permanent, CardInstance, Phase, type Seat, type DecisionRequest } from "@aegis/shared";
import { GameEngine, type GameEngineHooks } from "../../engine/GameEngine.js";
import type { Primitives } from "../../engine/effects/EffectContext.js";
import { setupEngine, settle as settleEngine } from "../../engine/testkit/harness.js";
import { compiled } from "./BT10-093.js";
import "./BT10-077.js";
import "./BT10-084.js";

const YUU = "BT10-093";
const DAMEMON = "BT10-075";
const CHUUCHUUMON = "BT10-073";
const SHOUTMON_X4B = "BT10-012";

let seq = 0;
function instance(cardId: string, seat: Seat): CardInstance {
  seq += 1;
  const c = new CardInstance();
  c.instanceId = `inst-${seq}`;
  c.cardId = cardId;
  c.ownerSeat = seat;
  c.faceUp = true;
  return c;
}

interface Harness {
  engine: GameEngine;
  state: GameState;
  optionalRequests: number;
  selectLimit: number;
}

function setup(): Harness {
  const state = new GameState();
  const harness: Harness = {
    engine: undefined as never,
    state,
    optionalRequests: 0,
    selectLimit: Number.POSITIVE_INFINITY,
  };
  let engineRef: GameEngine | undefined;
  const hooks: GameEngineHooks = {
    seed: 1,
    requestDecision: (seat, req: DecisionRequest) => {
      if (req.kind === "optional") {
        harness.optionalRequests += 1;
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "optional", accept: true },
          }),
        );
      }
      if (req.kind === "selectCards") {
        const candidates = req.options?.candidateInstanceIds ?? [];
        const cap = Math.min(req.options?.max ?? candidates.length, harness.selectLimit);
        const ids = candidates.slice(0, cap);
        queueMicrotask(() =>
          engineRef?.applyIntent(seat, {
            type: "respondDecision",
            decisionId: req.decisionId,
            response: { kind: "selectCards", instanceIds: ids },
          }),
        );
      }
    },
    emit: () => {},
  };
  const engine = new GameEngine(state, hooks);
  engineRef = engine;
  harness.engine = engine;
  engine.seatPlayer(0, "sa", { displayName: "A", deck: { mainDeck: [], eggDeck: [] } });
  engine.seatPlayer(1, "sb", { displayName: "B", deck: { mainDeck: [], eggDeck: [] } });
  state.phase = Phase.Main;
  state.turnSeat = 0;
  return harness;
}

function yuuTamerWith(state: GameState, underCardIds: string[]): { tamer: Permanent; under: CardInstance[] } {
  const tamer = new Permanent();
  tamer.permanentId = `tamer-${seq++}`;
  tamer.controllerSeat = 0;
  tamer.topCard = instance(YUU, 0);
  tamer.baseDP = 0;
  tamer.currentDP = 0;
  tamer.isSuspended = false;
  const under = underCardIds.map((id) => {
    const card = instance(id, 0);
    tamer.stack.push(card);
    return card;
  });
  (state.players[0] as PlayerState).battleArea.push(tamer);
  return { tamer, under };
}

async function settle(predicate: () => boolean, maxTicks = 400): Promise<void> {
  for (let i = 0; i < maxTicks && !predicate(); i++) await Promise.resolve();
}

describe("BT10-093 cross-permanent scaled play-cost reducer", () => {
  it("placing 2 purple Digimon under the played Lv.4 [Bagra Army] cuts cost by 4 and stacks them", async () => {
    const h = setup();
    const p0 = h.state.players[0] as PlayerState;
    const { tamer, under } = yuuTamerWith(h.state, [CHUUCHUUMON, SHOUTMON_X4B]);

    const damemon = instance(DAMEMON, 0);
    p0.hand.push(damemon);
    h.state.memory = 5;

    const res = h.engine.applyIntent(0, { type: "playCard", instanceId: damemon.instanceId });
    expect(res).toEqual({ ok: true });

    await settle(() => p0.battleArea.some((perm) => perm.topCard?.cardId === DAMEMON));
    const perm = p0.battleArea.find((p) => p.topCard?.cardId === DAMEMON);
    expect(perm).toBeDefined();

    for (const card of under) {
      expect(perm!.stack.some((c) => c.instanceId === card.instanceId)).toBe(true);
      expect(tamer.stack.some((c) => c.instanceId === card.instanceId)).toBe(false);
    }
    expect(h.state.memory).toBe(4);
  });

  it("ignores a Lv.3 [Bagra Army] play: no reduction, no decision, no placement (gate proof)", async () => {
    const h = setup();
    const p0 = h.state.players[0] as PlayerState;
    const { tamer } = yuuTamerWith(h.state, [SHOUTMON_X4B]);

    const chuu = instance(CHUUCHUUMON, 0);
    p0.hand.push(chuu);
    h.state.memory = 4;

    const res = h.engine.applyIntent(0, { type: "playCard", instanceId: chuu.instanceId });
    expect(res).toEqual({ ok: true });

    await settle(() => p0.battleArea.some((perm) => perm.topCard?.cardId === CHUUCHUUMON));
    const perm = p0.battleArea.find((p) => p.topCard?.cardId === CHUUCHUUMON);
    expect(perm).toBeDefined();

    expect(h.optionalRequests).toBe(0);
    expect(tamer.stack.length).toBe(1);
    expect(perm!.stack.length).toBe(0);
    expect(h.state.memory).toBe(0);
  });

  it("is once per turn: the second Lv.4 [Bagra Army] play earns no reduction", async () => {
    const h = setup();
    h.selectLimit = 1;
    const p0 = h.state.players[0] as PlayerState;
    const { tamer } = yuuTamerWith(h.state, [CHUUCHUUMON, SHOUTMON_X4B]);

    const first = instance(DAMEMON, 0);
    const second = instance(DAMEMON, 0);
    p0.hand.push(first, second);
    h.state.memory = 12;

    h.engine.applyIntent(0, { type: "playCard", instanceId: first.instanceId });
    await settle(() => p0.battleArea.some((perm) => perm.topCard?.instanceId === first.instanceId));
    expect(h.state.memory).toBe(9);
    expect(tamer.stack.length).toBe(1);
    expect(h.optionalRequests).toBe(1);

    await settleEngine();
    expect(h.engine.applyIntent(0, { type: "playCard", instanceId: second.instanceId })).toEqual({ ok: true });
    await settle(() => p0.battleArea.some((perm) => perm.topCard?.instanceId === second.instanceId));

    expect(h.optionalRequests).toBe(1);
    expect(tamer.stack.length).toBe(1);
    expect(h.state.memory).toBe(4);
  });
});

describe("BT10-093 [All Turns] purple-card-placed memory credits its OWNER, not turnSeat", () => {
  function primitivesOf(h: Harness): Primitives {
    return (h.engine as unknown as { primitives: Primitives }).primitives;
  }

  it("a purple card placed under this Tamer on the OPPONENT's turn still credits BT10-093's owner", async () => {
    const h = setup();
    const p0 = h.state.players[0] as PlayerState;
    const { tamer } = yuuTamerWith(h.state, []);

    h.state.turnSeat = 1;
    await h.engine.recomputeContinuousEffects();

    const memoryFor = (seat: 0 | 1): number => (seat === h.state.turnSeat ? h.state.memory : -h.state.memory) || 0;
    expect(memoryFor(0)).toBe(0);
    expect(memoryFor(1)).toBe(0);

    const purpleCard = instance(SHOUTMON_X4B, 0);
    p0.hand.push(purpleCard);
    await primitivesOf(h).placeUnder(tamer.permanentId, [purpleCard.instanceId]);

    await settle(() => tamer.stack.some((c) => c.instanceId === purpleCard.instanceId));
    await settle(() => memoryFor(0) !== 0 || memoryFor(1) !== 0, 50);

    expect(tamer.stack.some((c) => c.instanceId === purpleCard.instanceId)).toBe(true);

    expect(memoryFor(0)).toBe(1);
    expect(memoryFor(1)).toBe(-1);
  });
});

describe("BT10-093 Security", () => {
  it("plays itself without cost from Security", () => {
    const effect = compiled.effects?.find((entry) => entry.trigger === "Security");
    expect(effect).toMatchObject({ isSecurity: true, actions: [{ kind: "PlayWithoutCost", payCost: false }] });
  });
});

describe("BT10-093 Yuu Amano — KB Q&A rulings", () => {
  const yuuPromptCount = (decisions: { req: DecisionRequest }[]): number =>
    decisions.filter(({ req }) => req.kind === "optional" && (req.promptText ?? "").includes(YUU)).length;

  it("places purple Digimon from under several of your Tamers under the played Digimon (Q2024)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: YUU, as: "yuu", under: [{ card: CHUUCHUUMON, as: "underYuu" }] },
            {
              card: "BT10-092",
              as: "nene",
              under: [
                { card: "BT10-049", as: "greenUnderNene" },
                { card: "BT10-071", as: "firstUnderNene" },
                { card: SHOUTMON_X4B, as: "secondUnderNene" },
              ],
            },
          ],
          hand: [{ card: "BT10-084", as: "tactimon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 8;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tactimon").instanceId })).toEqual({
      ok: true,
    });
    await settleEngine(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === s.inst("tactimon").instanceId),
    );
    await settleEngine();

    const placedIds = [s.inst("underYuu"), s.inst("firstUnderNene"), s.inst("secondUnderNene")].map(
      ({ instanceId }) => instanceId,
    );
    const selection = s.decisions.find(({ req }) => req.kind === "selectCards" && req.options?.max === 3)!;
    expect([...(selection.req.options?.candidateInstanceIds ?? [])].sort()).toEqual([...placedIds].sort());
    const tactimon = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard?.instanceId === s.inst("tactimon").instanceId,
    )!;
    expect([...tactimon.stack.map(({ instanceId }) => instanceId)].sort()).toEqual([...placedIds].sort());
    expect(s.perm("yuu").stack).toHaveLength(0);
    expect(s.perm("nene").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("greenUnderNene").instanceId]);
    expect(s.state.memory).toBe(1);
  });

  it("counts its reduction before refusing a DigiXros play the remaining memory can afford", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: YUU,
              as: "yuu",
              under: [{ card: CHUUCHUUMON }, { card: "EX10-039" }, { card: CHUUCHUUMON }],
            },
            { card: "EX10-056", as: "bagramon" },
          ],
          hand: [{ card: "EX10-059", as: "darknessBagramon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 2;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("darknessBagramon").instanceId,
        digiXros: { materialInstanceIds: [s.inst("bagramon").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settleEngine(() =>
      s.state.players[0]!.battleArea.some(
        ({ topCard }) => topCard?.instanceId === s.inst("darknessBagramon").instanceId,
      ),
    );
    await settleEngine();

    expect(s.state.memory).toBe(-5);
    const played = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard?.instanceId === s.inst("darknessBagramon").instanceId,
    )!;
    expect(played.stack.map(({ cardId }) => cardId)).toContain("EX10-056");
    expect(s.perm("yuu").stack).toHaveLength(0);
  });

  it("processes its effect before DigiXros, so DigiXros materials go beneath the cards it placed (Q2025)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: YUU, as: "yuu", under: [{ card: "BT10-071", as: "placedByYuu" }] }],
          hand: [
            { card: "BT10-077", as: "madLeomon" },
            { card: CHUUCHUUMON, as: "digiXrosMaterial" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("madLeomon").instanceId,
        digiXros: { materialInstanceIds: [s.inst("digiXrosMaterial").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settleEngine(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === s.inst("madLeomon").instanceId),
    );
    await settleEngine();

    expect(yuuPromptCount(s.decisions)).toBe(1);
    expect(s.state.memory).toBe(4);
    const madLeomon = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard?.instanceId === s.inst("madLeomon").instanceId,
    )!;
    expect(madLeomon.stack.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("digiXrosMaterial").instanceId,
      s.inst("placedByYuu").instanceId,
    ]);
  });

  it("does not activate when 2 level 4 [Bagra Army] Digimon with DigiXros requirements are played at the same time (Q2026)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: YUU, as: "yuu", under: [{ card: "BT10-071", as: "underYuu" }] }],
          hand: [{ card: "BT10-084", as: "tactimon" }],
          trash: [
            { card: "BT10-077", as: "firstMadLeomon" },
            { card: "BT10-077", as: "secondMadLeomon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declineDigiXros: true, declinePrompts: [YUU] },
    );
    s.state.memory = 13;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tactimon").instanceId })).toEqual({
      ok: true,
    });
    await settleEngine(() =>
      ["firstMadLeomon", "secondMadLeomon"].every((alias) =>
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === s.inst(alias).instanceId),
      ),
    );
    await settleEngine();

    expect(yuuPromptCount(s.decisions)).toBe(1);
    expect(s.perm("yuu").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("underYuu").instanceId]);
  });
});
