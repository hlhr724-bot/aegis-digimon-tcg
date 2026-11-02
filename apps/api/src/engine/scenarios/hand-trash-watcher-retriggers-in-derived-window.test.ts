import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/hand-trash-watcher-retriggers-in-derived-window.fixture";

describe("pending hand-trash watcher triggering again", () => {
  it("offers the new Tsunomon trigger with the derived triggers of a later hand trash", async () => {
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      autoOrderTriggers: false,
    });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("ogremon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });

      const offered: string[][] = [];
      for (let step = 0; step < 10; step++) {
        await settle(
          () =>
            s.state.pendingDecision?.kind === "orderTriggers" ||
            (!observe(s.engine).isAttacking() && s.state.pendingDecision === undefined),
        );
        const pending = s.state.pendingDecision;
        if (pending === undefined) break;
        const request = s.decisions.at(-1)!.req;
        const cardIds = request.options!.triggerCardIds!;
        offered.push(cardIds);
        const preferred = offered.length === 1 ? "BT24-042" : "BT6-006";
        const index = Math.max(0, cardIds.indexOf(preferred));
        expect(
          s.engine.applyIntent(pending.seat, {
            type: "respondDecision",
            decisionId: pending.decisionId,
            response: { kind: "orderTriggers", order: [request.options!.triggerKeys![index]!] },
          }),
        ).toEqual({ ok: true });
      }

      expect(offered).toEqual([
        ["BT24-042", "BT6-006"],
        ["BT24-045", "BT6-006"],
      ]);
      const progress = s.events.flatMap((event) =>
        event.kind === "effectTriggered" && event.sourceCardId === "BT6-006"
          ? ["tsunomon"]
          : event.kind === "digivolved"
            ? [event.cardId]
            : [],
      );
      expect(progress).toEqual(["BT24-072", "tsunomon", "BT25-084"]);
      expect(s.state.pendingDecision).toBeUndefined();
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
