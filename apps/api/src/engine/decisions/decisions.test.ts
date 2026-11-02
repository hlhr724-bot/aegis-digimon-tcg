import { describe, it, expect, vi } from "vitest";
import { ArraySchema } from "@colyseus/schema";
import { GameState, PlayerState, type DecisionRequest, type DecisionResponse, type Seat } from "@aegis/shared";
import { DecisionManager, type DecisionTransport } from "./index.js";
import { createDecisionApi } from "./decisionApi.js";
import type { EffectContext } from "../effects/EffectContext.js";
import { observeEffectActivation } from "../effects/activationPresentation.js";

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

describe("DecisionManager", () => {
  it("raises a request, mirrors it into state.pendingDecision, and resolves on a matching respond", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);

    const promise = mgr.request({ seat: 1, kind: "optional", promptText: "Use it?" });

    expect(mgr.hasPending).toBe(true);
    expect(mgr.pendingSeat).toBe(1);
    expect(sent).toHaveLength(1);
    const decisionId = sent[0]!.req.decisionId;
    expect(sent[0]!.seat).toBe(1);
    // Mirrored into synchronized state so the wire gate + UI can see it.
    expect(state.pendingDecision).toBeDefined();
    expect(state.pendingDecision!.decisionId).toBe(decisionId);
    expect(state.pendingDecision!.seat).toBe(1);
    expect(state.pendingDecision!.kind).toBe("optional");

    const accepted = mgr.respond(1, decisionId, { kind: "optional", accept: true });
    expect(accepted).toBe(true);

    const response = await promise;
    expect(response).toEqual({ kind: "optional", accept: true });
    expect(mgr.hasPending).toBe(false);
    expect(state.pendingDecision).toBeUndefined();
  });

  it("rejects a respond from the wrong seat", () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    void mgr.request({ seat: 0, kind: "optional", promptText: "?" });
    const id = sent[0]!.req.decisionId;

    // Wrong seat answers: ignored (source OptionalSkill ignores selections for the
    // wrong player).
    expect(mgr.respond(1, id, { kind: "optional", accept: true })).toBe(false);
    expect(mgr.hasPending).toBe(true);
  });

  it("rejects a respond with a stale/unknown decisionId", () => {
    const state = makeState();
    const { transport } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    void mgr.request({ seat: 0, kind: "optional", promptText: "?" });

    expect(mgr.respond(0, "dec-999", { kind: "optional", accept: true })).toBe(false);
    expect(mgr.hasPending).toBe(true);
  });

  it("rejects a respond whose kind does not match the request", () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    void mgr.request({ seat: 0, kind: "chooseTargets", promptText: "?" });
    const id = sent[0]!.req.decisionId;

    // An optional response cannot satisfy a chooseTargets request.
    expect(mgr.respond(0, id, { kind: "optional", accept: true })).toBe(false);
    expect(mgr.hasPending).toBe(true);
    // The correct kind is accepted.
    expect(mgr.respond(0, id, { kind: "chooseTargets", instanceIds: [] })).toBe(true);
  });

  it("keeps an orderTriggers decision open until the client chooses exactly one offered trigger", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    const triggerKeys = ["instance-a::effect", "instance-b::effect"];
    const promise = mgr.request({
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next effect.",
      options: { triggerKeys },
    });
    const id = sent[0]!.req.decisionId;

    expect(mgr.respond(0, id, { kind: "orderTriggers", order: [] })).toBe(false);
    expect(mgr.respond(0, id, { kind: "orderTriggers", order: ["unknown"] })).toBe(false);
    expect(mgr.respond(0, id, { kind: "orderTriggers", order: triggerKeys })).toBe(false);
    expect(mgr.hasPending).toBe(true);

    expect(mgr.respond(0, id, { kind: "orderTriggers", order: [triggerKeys[1]!] })).toBe(true);
    await expect(promise).resolves.toEqual({ kind: "orderTriggers", order: [triggerKeys[1]!] });
  });

  it.each([undefined, null, 0, "first", {}, [null], [0]])(
    "rejects malformed trigger orders without closing the pending decision: %j",
    async (order) => {
      const state = makeState();
      const { transport, sent } = recordingTransport();
      const mgr = new DecisionManager(state, transport);
      const promise = mgr.request({
        seat: 0,
        kind: "orderTriggers",
        promptText: "Choose the next effect.",
        options: { triggerKeys: ["first", "second"], acceptsResolutionPlan: true },
      });
      const id = sent[0]!.req.decisionId;
      const malformed = { kind: "orderTriggers", optionIndex: 0, order } as unknown as DecisionResponse;

      expect(mgr.respond(0, id, malformed)).toBe(false);
      expect(mgr.hasPending).toBe(true);
      expect(state.pendingDecision?.decisionId).toBe(id);
      expect(mgr.respond(0, id, { kind: "orderTriggers", order: ["second"] })).toBe(true);
      await expect(promise).resolves.toEqual({ kind: "orderTriggers", order: ["second"] });
      expect(state.pendingDecision).toBeUndefined();
    },
  );

  describe.each(["chooseTargets", "selectCards"] as const)("%s response validation", (kind) => {
    it.each([undefined, null, 0, "first", {}, [null], [0]])(
      "rejects malformed selections and allows a valid retry: %j",
      async (instanceIds) => {
        const state = makeState();
        const { transport, sent } = recordingTransport();
        const mgr = new DecisionManager(state, transport);
        const promise = mgr.request({
          seat: 0,
          kind,
          promptText: "Choose a card.",
          options: { candidateInstanceIds: ["first"], min: 0, max: 1 },
        });
        const id = sent[0]!.req.decisionId;
        const malformed = {
          kind,
          instanceIds,
          targets: [{ kind: "permanent", permanentId: "first" }],
        } as unknown as DecisionResponse;

        expect(mgr.respond(0, id, malformed)).toBe(false);
        expect(state.pendingDecision?.decisionId).toBe(id);
        expect(mgr.respond(0, id, { kind, instanceIds: ["first"] })).toBe(true);
        await expect(promise).resolves.toEqual({ kind, instanceIds: ["first"] });
        expect(state.pendingDecision).toBeUndefined();
      },
    );
  });

  it.each([
    { kind: "optional", valid: { kind: "optional", accept: false }, invalid: { kind: "optional", accept: "false" } },
    {
      kind: "chooseOption",
      valid: { kind: "chooseOption", optionIndex: 0 },
      invalid: { kind: "chooseOption", optionIndex: -1 },
    },
    {
      kind: "chooseOption",
      valid: { kind: "chooseOption", optionIndex: 0 },
      invalid: { kind: "chooseOption", optionIndex: 0.5 },
    },
    { kind: "orderCards", valid: { kind: "orderCards", order: ["first"] }, invalid: { kind: "orderCards" } },
    {
      kind: "orderCards",
      valid: { kind: "orderCards", order: ["first"] },
      invalid: { kind: "orderCards", order: [0] },
    },
  ] as const)("rejects malformed $kind answers before resolving", async ({ kind, valid, invalid }) => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    const promise = mgr.request({ seat: 0, kind, promptText: "Choose.", options: { candidateInstanceIds: ["first"] } });
    const id = sent[0]!.req.decisionId;

    expect(mgr.respond(0, id, invalid as unknown as DecisionResponse)).toBe(false);
    expect(mgr.respond(0, id, null as unknown as DecisionResponse)).toBe(false);
    expect(mgr.respond(0, id, undefined as unknown as DecisionResponse)).toBe(false);
    expect(state.pendingDecision?.decisionId).toBe(id);
    expect(mgr.respond(0, id, structuredClone(valid) as DecisionResponse)).toBe(true);
    await expect(promise).resolves.toEqual(valid);
    expect(state.pendingDecision).toBeUndefined();
  });

  it("throws when a second decision is requested while one is open", () => {
    const state = makeState();
    const { transport } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    void mgr.request({ seat: 0, kind: "optional", promptText: "first" });
    expect(() => mgr.request({ seat: 1, kind: "optional", promptText: "second" })).toThrow(/still open/);
  });

  it("auto-resolves a stalled decision with the safe default after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const state = makeState();
      const { transport } = recordingTransport();
      const mgr = new DecisionManager(state, transport, { timeoutMs: 1000 });

      const promise = mgr.request({ seat: 0, kind: "optional", promptText: "?" });
      vi.advanceTimersByTime(1000);

      const response = await promise;
      // Safe default for an optional is decline.
      expect(response).toEqual({ kind: "optional", accept: false });
      expect(mgr.hasPending).toBe(false);
      expect(state.pendingDecision).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out an optional choice with a decline entry by declining, not by taking the first option", async () => {
    vi.useFakeTimers();
    try {
      const mgr = new DecisionManager(makeState(), recordingTransport().transport, { timeoutMs: 1000 });

      const promise = mgr.request({
        seat: 0,
        kind: "chooseOption",
        promptText: "?",
        options: { choices: ["First", "Second", "Don't use"], declineIndex: 2 },
      });
      vi.advanceTimersByTime(1000);

      expect(await promise).toEqual({ kind: "chooseOption", optionIndex: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels an optional choice with a decline entry by declining", async () => {
    const mgr = new DecisionManager(makeState(), recordingTransport().transport);

    const promise = mgr.request({
      seat: 0,
      kind: "chooseOption",
      promptText: "?",
      options: { choices: ["First", "Second", "Don't use"], declineIndex: 2 },
    });
    mgr.cancel();

    expect(await promise).toEqual({ kind: "chooseOption", optionIndex: 2 });
  });

  it("cancel() resolves the awaiting promise with the safe default and clears state", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);

    const promise = mgr.request({ seat: 1, kind: "selectCards", promptText: "?" });
    mgr.cancel();

    const response: DecisionResponse = await promise;
    expect(response).toEqual({ kind: "selectCards", instanceIds: [] });
    expect(mgr.hasPending).toBe(false);
    expect(state.pendingDecision).toBeUndefined();
    expect(sent).toHaveLength(1); // request was sent before cancel
  });

  it("forwards kind-specific options to the transport", () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    void mgr.request({
      seat: 0,
      kind: "chooseOption",
      promptText: "pick",
      options: { choices: ["A", "B"] },
    });
    expect(sent[0]!.req.options).toEqual({ choices: ["A", "B"] });
    // Options are JSON-encoded into the synchronized PendingDecision payload.
    expect(JSON.parse(state.pendingDecision!.payloadJson)).toEqual({ choices: ["A", "B"] });
  });
});

describe("createDecisionApi", () => {
  it("distinguishes activation acceptance from a later optional operation in the same clause", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    const api = createDecisionApi(mgr);
    const ctx = {
      activeEffectKey: "test/clause",
      source: { ownerSeat: 0, cardId: "AD1-020", instanceId: "source", permanent: () => undefined },
    } as unknown as EffectContext;
    const presentation = observeEffectActivation(ctx, true, () => {});
    const first = api.optional({ ...ctx }, "Use this effect?");
    expect(sent[0]!.req.options).toMatchObject({ effectKey: "test/clause", activationConfirmation: true });
    mgr.respond(0, sent[0]!.req.decisionId, { kind: "optional", accept: true });
    expect(await first).toBe(true);
    const later = api.optional({ ...ctx }, "Also play a card?");
    expect(sent[1]!.req.options).toMatchObject({ effectKey: "test/clause", activationConfirmation: false });
    mgr.respond(0, sent[1]!.req.decisionId, { kind: "optional", accept: false });
    expect(await later).toBe(false);
    presentation.restore();
  });

  /**
   * The overlay slices the printed clause for `options.timing` out of the card's full
   * effect text. Without a timing an optional prompt fell back to the WHOLE text, so a
   * card whose first printed clause is [Security] (AD1-020) showed its security effect
   * while resolving its [On Play] body.
   */
  it("tags an optional prompt with the resolving effect's timing", async () => {
    const state = makeState();
    const { transport, sent } = recordingTransport();
    const mgr = new DecisionManager(state, transport);
    const api = createDecisionApi(mgr);
    const ctx = {
      activeTiming: "OnPlay",
      source: {
        ownerSeat: 0 as Seat,
        cardId: "AD1-020",
        instanceId: "tamer-instance",
        permanent: () => ({ permanentId: "tamer-permanent" }),
        definition: { nameEn: "Tommy, Takuya, & Zoe" },
      },
    } as unknown as EffectContext;

    const promise = api.optional(ctx, "Place 2 card(s) under");
    expect(sent[0]!.req.options?.timing).toBe("OnPlay");
    expect(sent[0]!.req).toMatchObject({ sourceInstanceId: "tamer-instance", sourcePermanentId: "tamer-permanent" });
    mgr.respond(0, sent[0]!.req.decisionId, { kind: "optional", accept: false });
    await promise;
  });
});
