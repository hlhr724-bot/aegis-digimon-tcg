import { describe, expect, it } from "vitest";
import { drainMicrotasks, setupEngine, settle } from "../../engine/testkit/harness.js";
import "../ST23/ST23-03.js";
import "../ST23/ST23-02.js";
import "../ST23/ST23-13.js";
import "../ST23/ST23-15.js";
import "./BT25-041.js";

describe("GitHub #5319 — same-name BT25-041 printed security payment control", () => {
  it.each([
    ["empty security", []],
    ["wrong-trait top card", ["BT1-009"]],
    ["eligible Option below an ineligible top", ["BT1-009", "ST23-15"]],
  ] as const)("does not consume security or use a card with %s", async (_label, security) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST23-03", as: "base" }],
          hand: [{ card: "BT25-041", as: "murasamemon" }],
          security: [...security],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("murasamemon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard.cardId === "BT25-041" &&
        !s.state.pendingDecision &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    await drainMicrotasks();
    expect(s.state.players[0]!.security.map((card) => card.cardId)).toEqual(security);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.memory).toBe(7);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each([
    ["ST23-15", 10, 7],
    ["ST23-15", 3, 0],
    ["ST23-02", 10, 7],
    ["ST23-13", 10, 6],
  ] as const)(
    "can play or use %s supplied by its security payment from %i memory",
    async (cardId, initialMemory, finalMemory) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "ST23-03", as: "base" }],
            hand: [{ card: "BT25-041", as: "murasamemon" }],
            security: [{ card: cardId, as: "paidCard" }],
            deck: Array(4).fill("BT1-009"),
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferOptionIndex: 1 },
      );
      s.state.memory = initialMemory;
      const optionId = s.inst("paidCard").instanceId;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("murasamemon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() =>
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT25-041"),
      );
      await drainMicrotasks();
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(true);
      const payment = s.events.findIndex(
        (event) =>
          event.kind === "cardsMoved" &&
          event.from === "security" &&
          event.to === "hand" &&
          event.instanceIds.includes(optionId),
      );
      const playOrUse = s.events.findIndex((event) => event.kind === "cardPlayed" && event.instanceId === optionId);
      expect(payment).toBeGreaterThanOrEqual(0);
      expect(playOrUse).toBeGreaterThan(payment);
      expect(s.state.players[0]!.security).toHaveLength(0);
      expect(s.state.memory).toBe(finalMemory);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );

  it("pays security before the public mixed-card selection offers the newly added Option", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST23-03", as: "base" }],
          hand: [
            { card: "BT25-041", as: "murasamemon" },
            { card: "ST23-02", as: "otherChoice" },
          ],
          security: [{ card: "ST23-15", as: "option" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoChooseOption: true },
    );
    const optionId = s.inst("option").instanceId;
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("murasamemon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const choice = s.decisions.at(-1)!.req;
    expect(choice.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([optionId, s.inst("otherChoice").instanceId]),
    );
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === optionId)).toBe(true);
    expect(s.events.some((event) => event.kind === "cardPlayed" && event.instanceId === optionId)).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.decisionId,
        response: { kind: "selectCards", instanceIds: [optionId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.pendingDecision?.kind === "selectCards" && s.decisions.at(-1)!.req.sourceCardId === "ST23-15",
    );
    const optionPlay = s.decisions.at(-1)!.req;
    expect(optionPlay.options?.candidateInstanceIds).toEqual([s.inst("otherChoice").instanceId]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optionPlay.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("otherChoice").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT25-041"));
    await drainMicrotasks();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(true);
    expect(s.state.memory).toBe(7);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each([true, false])("preserves an existing hand Option and requires payable security (%s)", async (payable) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "ST23-03", as: "base" }],
          hand: [
            { card: "BT25-041", as: "murasamemon" },
            { card: "ST23-15", as: "option" },
          ],
          security: payable ? ["BT1-009"] : [],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    const optionId = s.inst("option").instanceId;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("murasamemon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard.cardId === "BT25-041" &&
        !s.state.pendingDecision &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    await drainMicrotasks();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === optionId)).toBe(payable);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === optionId)).toBe(!payable);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.memory).toBe(7);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
