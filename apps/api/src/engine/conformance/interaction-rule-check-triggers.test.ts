import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared";
import { advance } from "../testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine, type EngineSetup } from "../testkit/harness.js";
import { cite } from "./_kb.js";
import "../../cards/index.js";

type EffectResolvedEvent = Extract<ServerEvent, { kind: "effectResolved" }>;

function resolvedEvents(s: EngineSetup, cardIds: readonly string[]): EffectResolvedEvent[] {
  return s.events
    .filter((event): event is EffectResolvedEvent => event.kind === "effectResolved")
    .filter(({ sourceCardId }) => cardIds.includes(sourceCardId));
}

describe("CR §15-4-3-3 rule-check triggers join effects at the same timing", () => {
  it("offers a rule-check deletion beside a played Digimon's [On Play] at one checkpoint", async () => {
    cite(
      "comprehensive-0164",
      "§15-4-3-3 effects triggered by a rule check join effects at that timing",
      "8d2bf2fd50af6a37b28b64a0db252f4d9d0a9f033e72539337b25d6d330e5494",
    );
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-035", as: "zeroDpLeomon", dp: 0 }],
          hand: [{ card: "BT1-029", as: "playedGabumon" }],
          deck: Array(5).fill("BT1-009"),
        },
      },
      { autoOrderTriggers: false },
    );
    await s.ready();
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("playedGabumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "orderTriggers" ||
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-029"),
    );
    const request = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")?.req;
    expect([...(request?.options?.triggerCardIds ?? [])].sort()).toEqual(["BT1-029", "BT1-035"]);
    const cardIds = request!.options?.triggerCardIds ?? [];
    const keys = request!.options?.triggerKeys ?? [];
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request!.decisionId,
        response: { kind: "orderTriggers", order: [keys[cardIds.indexOf("BT1-029")]!] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT1-035"));
    expect(resolvedEvents(s, ["BT1-029", "BT1-035"]).map(({ sourceCardId }) => sourceCardId)).toEqual([
      "BT1-029",
      "BT1-035",
    ]);
  });

  it.each([true, false])(
    "orders rule-check Ascension with [Start of Your Turn] and accepts activation: %s",
    async (accept) => {
      cite(
        "comprehensive-0164",
        "§15-4-3-3 rule-check Ascension joins start-turn effects",
        "8d2bf2fd50af6a37b28b64a0db252f4d9d0a9f033e72539337b25d6d330e5494",
      );
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT25-040", as: "ascendingAngemon", dp: 0 },
              { card: "BT1-085", as: "startTurnTai" },
            ],
            hand: [{ card: "AD1-001", faceUp: true }],
            deck: Array(5).fill("AD1-001"),
            security: ["BT1-009"],
          },
          1: { deck: Array(5).fill("AD1-001") },
        },
        { autoOrderTriggers: false },
      );
      s.state.isFirstPlayersFirstTurn = true;
      s.state.memory = 1;
      await s.ready();
      const ascendingId = s.perm("ascendingAngemon").topCard!.instanceId;
      const turn = s.engine.runOneTurn();
      await settle(() => s.state.pendingDecision !== undefined);
      expect(s.state.pendingDecision?.kind).toBe("orderTriggers");
      const request = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
      expect([...(request.options?.triggerCardIds ?? [])].sort()).toEqual(["BT1-085", "BT25-040"]);
      const cardIds = request.options?.triggerCardIds ?? [];
      const keys = request.options?.triggerKeys ?? [];
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "orderTriggers", order: [keys[cardIds.indexOf("BT1-085")]!] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const ascent = s.decisions.findLast(({ req }) => req.kind === "optional")!.req;
      expect(ascent.options?.timing).toBe("Ascension");
      expect(ascent.options?.candidateInstanceIds).toBeUndefined();
      expect(ascent.sourceCardId).toBe("BT25-040");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: ascent.decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.players[0]!.security.some(({ instanceId }) => instanceId === ascendingId)).toBe(accept);
      expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === ascendingId)).toBe(!accept);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await turn;
      assertNoLoudGap(s);
    },
  );

  it("drops pending [On Deletion] when rule-check Ascension is chosen first", async () => {
    cite(
      "comprehensive-0164",
      "§15-4-3-3 same-timing rule-check Ascension; §15-4-4-3 pending source changes zone",
      "8d2bf2fd50af6a37b28b64a0db252f4d9d0a9f033e72539337b25d6d330e5494",
    );
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-075", as: "ascendingScourge", dp: 0 },
            { card: "BT1-089", as: "tamer", under: [{ card: "BT1-010", faceUp: false }] },
            { card: "BT1-085", as: "startTurnTai" },
          ],
          trash: [{ card: "BT26-052", as: "glowingDawn" }],
          hand: [{ card: "AD1-001", faceUp: true }],
          deck: Array(5).fill("AD1-001"),
        },
        1: { deck: Array(5).fill("AD1-001") },
      },
      { autoOrderTriggers: false, autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.isFirstPlayersFirstTurn = true;
    s.state.memory = 1;
    await s.ready();
    const ascendingId = s.perm("ascendingScourge").topCard!.instanceId;
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const request = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect([...(request.options?.triggerCardIds ?? [])].sort()).toEqual(["BT1-085", "BT1-089", "BT26-075", "BT26-075"]);
    const ascensionKey = request.options?.triggerKeys?.find((key) => key.includes("ascension/"));
    expect(ascensionKey).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "orderTriggers", order: [ascensionKey!] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "orderTriggers" && s.state.pendingDecision.decisionId !== request.decisionId,
    );
    const remaining = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    const remainingCards = remaining.options?.triggerCardIds ?? [];
    expect(remainingCards).not.toContain("BT26-075");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: remaining.decisionId,
        response: { kind: "orderTriggers", order: [remaining.options!.triggerKeys![0]!] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[0]!.security.some(({ instanceId }) => instanceId === ascendingId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT26-052")).toBe(false);
    expect(s.perm("tamer").stack.some(({ cardId }) => cardId === "BT1-010")).toBe(true);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    assertNoLoudGap(s);
  });

  it("drops an inherited [On Deletion] when its host ascends before activation", async () => {
    cite(
      "comprehensive-0164",
      "§15-4-3-3 same-timing Ascension; §15-4-4-3 inherited source leaves deleted host",
      "8d2bf2fd50af6a37b28b64a0db252f4d9d0a9f033e72539337b25d6d330e5494",
    );
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-040", as: "ascendingHost", dp: 0, under: ["BT1-030"] },
            { card: "BT1-085", as: "startTurnTai" },
          ],
          hand: [{ card: "AD1-001", faceUp: true }],
          deck: Array(5).fill("AD1-001"),
        },
        1: { deck: Array(5).fill("AD1-001") },
      },
      { autoOrderTriggers: false, autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.isFirstPlayersFirstTurn = true;
    s.state.memory = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const request = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect([...(request.options?.triggerCardIds ?? [])].sort()).toEqual(["BT1-030", "BT1-085", "BT25-040"]);
    const ascentKey = request.options?.triggerKeys?.find((key) => key.includes("ascension/"));
    expect(ascentKey).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "orderTriggers", order: [ascentKey!] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT1-030")).toBe(false);
    expect(s.state.memory).toBe(3);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    assertNoLoudGap(s);
  });

  it("drops a surviving rule-check watcher if an earlier same-batch effect removes its source", async () => {
    cite(
      "comprehensive-0164",
      "§15-4-3-3 same rule-check batch; §15-4-4-3 source loss before activation",
      "8d2bf2fd50af6a37b28b64a0db252f4d9d0a9f033e72539337b25d6d330e5494",
    );
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-063", as: "princeMamemon", dp: 0 }],
          hand: [{ card: "AD1-001", faceUp: true }],
          deck: Array(5).fill("BT1-009"),
        },
        1: { battleArea: [{ card: "BT19-075", as: "moonMillenniummon" }], deck: Array(5).fill("BT1-009") },
      },
      { autoOrderTriggers: true, autoDeclineOptional: true },
    );
    s.state.isFirstPlayersFirstTurn = true;
    s.state.memory = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT19-075")).toBe(false);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    assertNoLoudGap(s);

    const control = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-035", as: "zeroDpLeomon", dp: 0 }],
          hand: [{ card: "AD1-001", faceUp: true }],
          deck: Array(5).fill("BT1-009"),
          security: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT19-075", as: "survivingWatcher" }], deck: Array(5).fill("BT1-009") },
      },
      { autoOrderTriggers: true },
    );
    control.state.isFirstPlayersFirstTurn = true;
    control.state.memory = 1;
    await control.ready();
    const controlTurn = control.engine.runOneTurn();
    await advance(control.engine).waitForMainPhase(0);
    expect(control.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT19-075")).toBe(
      true,
    );
    expect(control.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await controlTurn;
    assertNoLoudGap(control);
  });

  it("offers zero-DP [On Deletion] and [Start of Your Turn] in one order choice", async () => {
    cite(
      "comprehensive-0164",
      "§15-4-3-3 zero-DP start-of-turn example; §15-4-3-4 controller order",
      "8d2bf2fd50af6a37b28b64a0db252f4d9d0a9f033e72539337b25d6d330e5494",
    );
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-035", as: "zeroDpLeomon", dp: 0 },
            { card: "BT1-085", as: "startTurnTai" },
          ],
          hand: [{ card: "AD1-001", faceUp: true }],
          deck: Array(5).fill("AD1-001"),
        },
        1: { deck: Array(5).fill("AD1-001") },
      },
      { autoOrderTriggers: false },
    );
    s.state.isFirstPlayersFirstTurn = true;
    s.state.memory = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers" || s.engine.mainPhase.isOpen);
    expect(s.state.pendingDecision?.kind).toBe("orderTriggers");
    const request = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect(request.seat).toBe(0);
    expect([...(request.options?.triggerCardIds ?? [])].sort()).toEqual(["BT1-035", "BT1-085"]);
    const keys = request.options?.triggerKeys ?? [];
    const cardIds = request.options?.triggerCardIds ?? [];
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "orderTriggers", order: [keys[cardIds.indexOf("BT1-085")]!] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.events.filter(
        (event) => event.kind === "effectResolved" && ["BT1-035", "BT1-085"].includes(event.sourceCardId),
      ),
    ).toMatchObject([{ sourceCardId: "BT1-085" }, { sourceCardId: "BT1-035" }]);
    expect(s.state.memory).toBe(5);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    assertNoLoudGap(s);
  });

  it("seat 1 orders its start-turn and rule-check effects before seat 0's rule-check effect", async () => {
    cite(
      "comprehensive-0164",
      "§15-4-3-3 rule-check effects join the timing; §15-4-3-5 turn player first",
      "8d2bf2fd50af6a37b28b64a0db252f4d9d0a9f033e72539337b25d6d330e5494",
    );
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-035", as: "otherLeomon", dp: 0 }], deck: Array(5).fill("AD1-001") },
        1: {
          battleArea: [
            { card: "BT1-035", as: "turnLeomon", dp: 0 },
            { card: "BT1-085", as: "startTurnTai" },
          ],
          hand: [{ card: "AD1-001", faceUp: true }],
          deck: Array(5).fill("AD1-001"),
        },
      },
      { autoOrderTriggers: false },
    );
    s.state.turnSeat = 1;
    s.state.isFirstPlayersFirstTurn = true;
    s.state.memory = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const request = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect(request.seat).toBe(1);
    expect([...(request.options?.triggerCardIds ?? [])].sort()).toEqual(["BT1-035", "BT1-085"]);
    const keys = request.options?.triggerKeys ?? [];
    const cardIds = request.options?.triggerCardIds ?? [];
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "orderTriggers", order: [keys[cardIds.indexOf("BT1-085")]!] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(resolvedEvents(s, ["BT1-035", "BT1-085"]).map(({ seat, sourceCardId }) => ({ seat, sourceCardId }))).toEqual(
      [
        { seat: 1, sourceCardId: "BT1-085" },
        { seat: 1, sourceCardId: "BT1-035" },
        { seat: 0, sourceCardId: "BT1-035" },
      ],
    );
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    assertNoLoudGap(s);
  });

  it("keeps a rule check caused by a chosen deletion effect in a later derived batch", async () => {
    cite(
      "comprehensive-0164",
      "§15-4-3-3 initial same-timing group; §15-4-5-2/3 derived effects",
      "8d2bf2fd50af6a37b28b64a0db252f4d9d0a9f033e72539337b25d6d330e5494",
    );
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX8-033", as: "zeroDpGotsumon", dp: 0 },
            { card: "BT1-085", as: "startTurnTai" },
          ],
          hand: [{ card: "AD1-001", faceUp: true }],
          deck: Array(5).fill("AD1-001"),
        },
        1: { battleArea: [{ card: "BT1-035", as: "otherLeomon", dp: 4000 }], deck: Array(5).fill("AD1-001") },
      },
      { autoOrderTriggers: false, autoSelectCards: true },
    );
    s.state.isFirstPlayersFirstTurn = true;
    s.state.memory = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const request = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect([...(request.options?.triggerCardIds ?? [])].sort()).toEqual(["BT1-085", "EX8-033"]);
    const keys = request.options?.triggerKeys ?? [];
    const cardIds = request.options?.triggerCardIds ?? [];
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "orderTriggers", order: [keys[cardIds.indexOf("EX8-033")]!] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      resolvedEvents(s, ["EX8-033", "BT1-035", "BT1-085"]).map(({ seat, sourceCardId }) => ({ seat, sourceCardId })),
    ).toEqual([
      { seat: 0, sourceCardId: "EX8-033" },
      { seat: 1, sourceCardId: "BT1-035" },
      { seat: 0, sourceCardId: "BT1-085" },
    ]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    assertNoLoudGap(s);
  });

  it("keeps a rule-check deletion watcher with printed start-turn and deletion effects", async () => {
    cite(
      "comprehensive-0164",
      "§15-4-3-3 same timing includes rule-check deletion watchers",
      "8d2bf2fd50af6a37b28b64a0db252f4d9d0a9f033e72539337b25d6d330e5494",
    );
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX13-028", as: "zeroDpSukamon", dp: 0 },
            { card: "ST3-10", as: "watcherHost", under: ["EX13-031"] },
            { card: "BT1-085", as: "startTurnTai" },
          ],
          hand: [{ card: "AD1-001", faceUp: true }],
          deck: Array(8).fill("BT1-009"),
        },
        1: { deck: Array(5).fill("BT1-009") },
      },
      { autoOrderTriggers: false, autoDeclineOptional: true },
    );
    s.state.isFirstPlayersFirstTurn = true;
    s.state.memory = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const first = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect([...(first.options?.triggerCardIds ?? [])].sort()).toEqual(["BT1-085", "EX13-028", "EX13-031"]);
    const cardIds = first.options?.triggerCardIds ?? [];
    const keys = first.options?.triggerKeys ?? [];
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: first.decisionId,
        response: { kind: "orderTriggers", order: [keys[cardIds.indexOf("BT1-085")]!] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "orderTriggers" && s.state.pendingDecision.decisionId !== first.decisionId,
    );
    const second = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect([...(second.options?.triggerCardIds ?? [])].sort()).toEqual(["EX13-028", "EX13-031"]);
    const remainingKeys = second.options?.triggerKeys ?? [];
    const remainingCards = second.options?.triggerCardIds ?? [];
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: second.decisionId,
        response: { kind: "orderTriggers", order: [remainingKeys[remainingCards.indexOf("EX13-031")]!] },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(resolvedEvents(s, ["BT1-085", "EX13-028", "EX13-031"]).map(({ sourceCardId }) => sourceCardId)).toEqual([
      "BT1-085",
      "EX13-031",
      "EX13-028",
    ]);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    assertNoLoudGap(s);
  });
});
