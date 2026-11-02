import "#api/cards/index";
import { expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/turn-player-evolution-before-opponent-play-watcher.fixture";

it.each([true, false])(
  "keeps turn-player evolution ahead of an opponent play watcher (evolve=%s)",
  async (acceptEvolution) => {
    const s = setupScenario(fixture, { autoAcceptOptional: false, autoSelectCards: true, autoOrderTriggers: false });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("butenmon").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      for (let step = 0; step < 8; step += 1) {
        await settle(() => s.state.pendingDecision !== undefined);
        const pending = s.state.pendingDecision!;
        if (pending.kind === "orderTriggers") {
          break;
        }
        expect(["optional", "chooseOption"]).toContain(pending.kind);
        expect(
          s.engine.applyIntent(pending.seat, {
            type: "respondDecision",
            decisionId: pending.decisionId,
            response:
              pending.kind === "chooseOption"
                ? { kind: "chooseOption", optionIndex: 0 }
                : { kind: "optional", accept: true },
          }),
        ).toEqual({ ok: true });
        await settle(() => s.state.pendingDecision?.decisionId !== pending.decisionId);
      }
      const order = s.state.pendingDecision!;
      const payload = JSON.parse(order.payloadJson) as { triggerKeys: string[]; triggerCardIds: string[] };
      expect(order.seat).toBe(0);
      expect(payload.triggerCardIds).toEqual(expect.arrayContaining(["BT26-015", "BT26-001"]));
      const attackKey = payload.triggerKeys[payload.triggerCardIds.indexOf("BT26-015")]!;
      const evolutionKey = payload.triggerKeys[payload.triggerCardIds.indexOf("BT26-001")]!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: order.decisionId,
          response: { kind: "orderTriggers", order: [attackKey, evolutionKey], optionalAnswers: { [attackKey]: true } },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT26-001") ||
          s.events.some(
            (event) =>
              event.kind === "effectTriggered" && event.sourceCardId === "EX12-034" && event.timing === "whenPlayed",
          ),
      );
      expect(
        s.events.some(
          (event) =>
            event.kind === "effectTriggered" && event.sourceCardId === "EX12-034" && event.timing === "whenPlayed",
        ),
      ).toBe(false);
      expect(s.state.pendingDecision?.seat).toBe(0);
      expect(s.decisions.at(-1)?.req.sourceCardId).toBe("BT26-001");
      const evolution = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: evolution.decisionId,
          response: { kind: "optional", accept: acceptEvolution },
        }),
      ).toEqual({ ok: true });
      for (let step = 0; step < 8; step += 1) {
        await settle(() => s.state.pendingDecision !== undefined || !observe(s.engine).isAttacking());
        const pending = s.state.pendingDecision;
        if (pending === undefined) {
          break;
        }
        expect(["optional", "chooseOption"]).toContain(pending.kind);
        expect(
          s.engine.applyIntent(pending.seat, {
            type: "respondDecision",
            decisionId: pending.decisionId,
            response:
              pending.kind === "chooseOption"
                ? { kind: "chooseOption", optionIndex: 0 }
                : { kind: "optional", accept: true },
          }),
        ).toEqual({ ok: true });
        await settle(() => s.state.pendingDecision?.decisionId !== pending.decisionId);
      }
      await settle(() => s.state.pendingDecision === undefined && !observe(s.engine).isAttacking());
      const erlangActivations = s.events.filter(
        (event) =>
          event.kind === "effectTriggered" && event.sourceCardId === "EX12-034" && event.timing === "whenPlayed",
      );
      expect(erlangActivations).toHaveLength(acceptEvolution ? 0 : 1);
      expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX12-034")).toBe(
        !acceptEvolution,
      );
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT26-016")).toBe(
        acceptEvolution,
      );
      expect(s.state.pendingDecision).toBeUndefined();
      expect(observe(s.engine).isAttacking()).toBe(false);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
