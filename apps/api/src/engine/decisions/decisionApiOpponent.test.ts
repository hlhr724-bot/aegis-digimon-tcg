import { describe, it, expect } from "vitest";
import { ArraySchema } from "@colyseus/schema";
import { GameState, PlayerState, getCardDefinition, type DecisionRequest, type Seat } from "@aegis/shared";
import { DecisionManager, type DecisionTransport } from "./index.js";
import { createDecisionApi, requireOpponentAsk } from "./decisionApi.js";
import type { EffectContext } from "../effects/EffectContext.js";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";

/**
 * Proves the 7th BT26-engine-gaps fix: the decision API can address the effect's
 * NON-controlling seat, and the routing that makes that safe end to end —
 * `DecisionManager` unicasts to (and only accepts a response from) the addressed
 * seat, regardless of which seat is the effect's controller.
 */

function makeState(): GameState {
  const state = new GameState();
  state.players = new ArraySchema<PlayerState>();
  for (const seat of [0, 1] as const) {
    const p = new PlayerState();
    p.seat = seat;
    state.players[seat] = p;
  }
  return state;
}

function recordingTransport(): { transport: DecisionTransport; sent: Array<{ seat: Seat; req: DecisionRequest }> } {
  const sent: Array<{ seat: Seat; req: DecisionRequest }> = [];
  return {
    sent,
    transport: { requestDecision: (seat, req) => sent.push({ seat, req }) },
  };
}

/** A minimal EffectContext: controller is seat 0, opponentOf flips 0<->1. */
function makeCtx(): EffectContext {
  return {
    activeTiming: "OnDestroyedAnyone",
    source: {
      ownerSeat: 0 as Seat,
      cardId: "BT26-072",
      definition: { nameEn: "Peckmon" },
      permanent: () => undefined,
    },
    game: { opponentOf: (s: Seat) => (s === 0 ? 1 : 0) as Seat },
  } as unknown as EffectContext;
}

describe("ctx.ask.opponent (opponent-addressed decisions)", () => {
  it("addresses the request to the opponent's seat, not the controller's", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    const api = createDecisionApi(mgr);
    const ctx = makeCtx(); // controller is seat 0

    const promise = api.opponent!.selectCards(ctx, { candidates: ["c1", "c2"], min: 1, max: 1 });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.seat).toBe(1); // opponent of seat 0, not the controller
    expect(state.pendingDecision!.seat).toBe(1);

    mgr.respond(1, sent[0]!.req.decisionId, { kind: "selectCards", instanceIds: ["c1"] });
    expect(await promise).toEqual(["c1"]);
  });

  it("the controller (wrong seat) cannot answer a decision addressed to the opponent", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    const api = createDecisionApi(mgr);
    const ctx = makeCtx();

    const promise = api.opponent!.selectCards(ctx, { candidates: ["c1"], min: 1, max: 1 });
    const decisionId = sent[0]!.req.decisionId;

    // Seat 0 is the controller (ctx.source.ownerSeat) but NOT the addressed seat (1).
    // FAILS-WHEN-REVERTED (routing broken to accept the controller's seat instead of
    // the addressed seat): this would return true and resolve the promise wrongly.
    expect(mgr.respond(0, decisionId, { kind: "selectCards", instanceIds: ["c1"] })).toBe(false);
    expect(mgr.hasPending).toBe(true); // still open — the wrong-seat answer was ignored

    // The addressed seat (1) can still answer it.
    expect(mgr.respond(1, decisionId, { kind: "selectCards", instanceIds: ["c1"] })).toBe(true);
    expect(await promise).toEqual(["c1"]);
  });

  it("ctx.ask.* (no .opponent) still addresses the controller, unaffected by the addition", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    const api = createDecisionApi(mgr);
    const ctx = makeCtx();

    const promise = api.selectCards(ctx, { candidates: ["c1"], min: 1, max: 1 });
    expect(sent[0]!.seat).toBe(0); // ctx.source.ownerSeat
    mgr.respond(0, sent[0]!.req.decisionId, { kind: "selectCards", instanceIds: ["c1"] });
    await promise;
  });

  it("keeps public permanents visible while only legal targets are selectable", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    const api = createDecisionApi(mgr);
    const ctx = makeCtx();

    const promise = api.chooseTargets(ctx, {
      candidates: ["active-1", "active-2"],
      visible: ["active-1", "active-2", "suspended"],
      min: 1,
      max: 1,
    });

    expect(sent[0]!.req.options).toMatchObject({
      candidateInstanceIds: ["active-1", "active-2"],
      visibleInstanceIds: ["active-1", "active-2", "suspended"],
    });
    mgr.respond(0, sent[0]!.req.decisionId, { kind: "chooseTargets", instanceIds: ["active-2"] });
    expect(await promise).toEqual(["active-2"]);
  });

  it("publishes an aggregate DP budget with a permanent-selection decision", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    const api = createDecisionApi(mgr);
    const ctx = makeCtx();

    const promise = api.chooseTargets(ctx, {
      candidates: ["dp-2k", "dp-4k"],
      min: 1,
      max: 2,
      maxTotalDP: 6000,
    });

    expect(sent[0]!.req.options).toMatchObject({ maxTotalDP: 6000 });
    mgr.respond(0, sent[0]!.req.decisionId, {
      kind: "chooseTargets",
      instanceIds: ["dp-2k", "dp-4k"],
    });
    expect(await promise).toEqual(["dp-2k", "dp-4k"]);
  });

  it("requireOpponentAsk throws loudly rather than silently no-op when ctx.ask.opponent is missing", () => {
    const ctx = { ask: {} } as unknown as EffectContext;
    // FAILS-WHEN-REVERTED (a card reading ctx.ask.opponent directly instead of going
    // through this guard): `undefined?.selectCards(...)` resolves to `undefined` and a
    // caller that doesn't check would treat that as an empty/no-op selection instead of
    // a loud failure.
    expect(() => requireOpponentAsk(ctx)).toThrow(/ctx\.ask\.opponent is not wired/);
  });
});

describe("staged effect presentation", () => {
  it.each([false, true])("keeps the full effect and changes emphasis per step (opponent: %s)", async (opponent) => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const manager = new DecisionManager(state, transport);
    const api = createDecisionApi(manager);
    const ask = opponent ? api.opponent! : api;
    const ctx = makeCtx();
    const clause = "[On Play] Draw 1. Then, you may suspend 1 of your opponent's Digimon.";
    ctx.activeEffectText = `[Start of Your Turn] Set memory to 3.\n${clause}`;
    ctx.activeEffectTextPart = "draw 1.";
    const first = ask.selectCards(ctx, { candidates: ["c1"], min: 1, max: 1 });
    expect(sent[0]!.req.options).toMatchObject({
      effectText: clause,
      effectTextPart: "draw 1.",
      effectTextEmphasis: "draw 1.",
    });
    manager.respond(sent[0]!.seat, sent[0]!.req.decisionId, { kind: "selectCards", instanceIds: ["c1"] });
    expect(await first).toEqual(["c1"]);
    ctx.activeEffectTextPart = "Then, you may suspend 1 of your opponent's Digimon.";
    const second = ask.optional(ctx, "Use the second step?");
    expect(sent[1]!.req.options).toMatchObject({
      effectText: clause,
      effectTextPart: ctx.activeEffectTextPart,
      effectTextEmphasis: ctx.activeEffectTextPart,
    });
    manager.respond(sent[1]!.seat, sent[1]!.req.decisionId, { kind: "optional", accept: false });
    expect(await second).toBe(false);
    // Presentation does not overwrite interpreter state for the next action.
    expect(ctx.activeEffectTextPart).toBe("Then, you may suspend 1 of your opponent's Digimon.");
  });

  it.each(["Draw 1.", "Unrelated passage", ""])(
    "does not invent a stage for an unmatched or complete passage: %s",
    async (part) => {
      const state = makeState();
      const { transport, sent } = recordingTransport();
      const manager = new DecisionManager(state, transport);
      const api = createDecisionApi(manager);
      const ctx = makeCtx();
      ctx.activeEffectText = "Draw 1.";
      ctx.activeEffectTextPart = part;
      const decision = api.optional(ctx, "Use this effect?");
      expect(sent[0]!.req.options?.effectTextEmphasis).toBeUndefined();
      expect(sent[0]!.req.options?.effectTextPart).toBe(part);
      manager.respond(0, sent[0]!.req.decisionId, { kind: "optional", accept: false });
      expect(await decision).toBe(false);
    },
  );
});

it("preserves a complete multiline modal effect while highlighting the selected bullet", async () => {
  const state = makeState();
  const { transport, sent } = recordingTransport();
  const manager = new DecisionManager(state, transport);
  const api = createDecisionApi(manager);
  const ctx = makeCtx();
  ctx.activeEffectText = getCardDefinition("BT17-015")!.effectText!;
  const bullet = ctx.activeEffectText.split("\n").find((line) => line.startsWith("・"))!;
  expect(bullet).toBeTruthy();
  ctx.activeEffectTextPart = bullet;
  const decision = api.optional(ctx, "Activate the selected effect?");
  const clause = ctx.activeEffectText.slice(ctx.activeEffectText.indexOf("[On Play]"));
  expect(sent[0]!.req.options).toMatchObject({
    effectText: clause,
    effectTextPart: bullet,
    effectTextEmphasis: bullet,
  });
  expect(sent[0]!.req.options!.effectText).toContain("Activate 1 of the effects below:");
  manager.respond(0, sent[0]!.req.decisionId, { kind: "optional", accept: false });
  expect(await decision).toBe(false);
});

it("preserves effect ownership on an opponent-only decision without changing its authorized recipient", async () => {
  const state = makeState();
  const { transport, sent } = recordingTransport();
  const manager = new DecisionManager(state, transport);
  const api = createDecisionApi(manager);
  const ctx = makeCtx();
  ctx.activeDecisionSummary = getDecisionEffectSummary({ actions: [{ kind: "GainMemory", amount: 2 }] });
  const result = api.opponent!.chooseOption(ctx, ["First", "Second"]);
  expect(sent.map((entry) => entry.seat)).toEqual([1]);
  expect(sent[0]!.req.options).toMatchObject({ effectControllerSeat: 0, effectSummary: { memoryGain: 2 } });
  expect(manager.respond(0, sent[0]!.req.decisionId, { kind: "chooseOption", optionIndex: 1 })).toBe(false);
  expect(manager.respond(1, sent[0]!.req.decisionId, { kind: "chooseOption", optionIndex: 1 })).toBe(true);
  expect(await result).toBe(1);
});
