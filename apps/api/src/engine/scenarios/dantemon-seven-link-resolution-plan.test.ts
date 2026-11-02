import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/dantemon-seven-link-resolution-plan.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it("resolves a public full trigger order after Cyber Engage assembles and links seven cards", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false });
  await s.ready();
  const loop = s.engine.startTurnLoop();
  let fullOrders = 0;
  try {
    await advance(s.engine).waitForMainPhase(0);
    const effect = observe(s.engine).activatableEffects(s.perm("cyber-engage"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("cyber-engage").instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    for (let step = 0; step < 30; step += 1) {
      await settle(
        () =>
          s.state.pendingDecision?.kind === "orderTriggers" ||
          (s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT25-098") &&
            !s.state.pendingDecision &&
            !observe(s.engine).isAttacking()),
      );
      const pending = s.state.pendingDecision;
      if (!pending) {
        break;
      }
      const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
      const keys = request.options!.triggerKeys!;
      if (keys.length >= 7) {
        fullOrders += 1;
      }
      expect(
        s.engine.applyIntent(pending.seat, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: {
            kind: "orderTriggers",
            order: keys,
            optionalAnswers: Object.fromEntries(keys.map((key) => [key, true])),
          },
        }),
      ).toEqual({ ok: true });
    }
    await settle(() => !s.state.pendingDecision && !observe(s.engine).isAttacking());
    expect(fullOrders).toBeGreaterThan(0);
    expect(s.perm("dantemon").linked).toHaveLength(7);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
