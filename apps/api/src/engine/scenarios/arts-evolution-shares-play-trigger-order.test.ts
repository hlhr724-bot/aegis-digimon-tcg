import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/arts-evolution-shares-play-trigger-order.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { drainMicrotasks, settle } from "#api/engine/testkit/harness";

it.each([
  [false, false],
  [false, true],
  [true, false],
])(
  "resolves revived On Play and Arts evolution triggers in one chosen order (watcher=%s evolutionFirst=%s)",
  async (watcher, evolutionFirst) => {
    const options = { autoAcceptOptional: false, autoSelectCards: false, autoOrderTriggers: false };
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...fixture.board[0],
            battleArea: fixture.board[0]!.battleArea!.map((permanent) =>
              typeof permanent !== "string" && permanent.as === "tamer" && watcher
                ? { ...permanent, card: "ST14-11" }
                : permanent,
            ),
          },
        },
      },
      options,
    );
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("nosferamon").instanceId, useAs: "option" }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst("played").instanceId] },
        }),
      ).toEqual({ ok: true });
      await drainMicrotasks();
      await settle(() => s.state.pendingDecision?.promptText.includes("Arts Digivolve") === true);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "selectCards", instanceIds: [s.perm("arts-base").topCard.instanceId] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => s.state.pendingDecision !== undefined && !s.state.pendingDecision.promptText.includes("Arts Digivolve"),
      );
      expect(s.state.pendingDecision?.kind).toBe("orderTriggers");
      const pending = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision?.decisionId)!.req;
      expect(pending.options?.triggerCardIds).toEqual(expect.arrayContaining(["ST23-03", "BT27-082"]));
      expect(pending.options?.triggerCardIds?.includes("ST14-11")).toBe(watcher);
      const handBeforeOrdering = s.state.players[0]!.hand.length;
      const priority = evolutionFirst ? ["BT27-082", "ST23-03", "ST14-11"] : ["ST23-03", "BT27-082", "ST14-11"];
      for (let step = 0; step < 12 && s.state.pendingDecision !== undefined; step += 1) {
        const request = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision!.decisionId)!.req;
        expect(["orderTriggers", "optional"]).toContain(request.kind);
        let response: DecisionResponse;
        if (request.kind === "orderTriggers") {
          const cardIds = request.options?.triggerCardIds ?? [];
          const next = priority.find((cardId) => cardIds.includes(cardId))!;
          response = { kind: "orderTriggers", order: [], orderIndexes: [cardIds.indexOf(next)] };
        } else {
          response = { kind: "optional", accept: false };
        }
        expect(s.engine.applyIntent(0, { type: "respondDecision", decisionId: request.decisionId, response })).toEqual({
          ok: true,
        });
        await drainMicrotasks();
      }
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.perm("arts-base").topCard.cardId).toBe("BT27-082");
      expect(s.perm("played").topCard.cardId).toBe("ST23-03");
      expect(s.perm("tamer").stack).toHaveLength(2);
      expect(s.perm("tamer").isSuspended).toBe(false);
      expect(s.state.memory).toBe(5);
      expect(s.state.players[0]!.security).toHaveLength(3);
      expect(s.state.players[0]!.hand).toHaveLength(handBeforeOrdering + 1);
      expect(
        s.events.filter(
          (event) => event.kind === "effectTriggered" && event.sourceCardId === "ST23-03" && event.timing === "OnPlay",
        ),
      ).toHaveLength(1);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
