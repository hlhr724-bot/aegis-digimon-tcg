import { describe, expect, it } from "vitest";
import type { DecisionResponse } from "@aegis/shared";
import fixture from "#api/engine/scenarios/derived-opponent-hand-trash-before-pending-security-watcher.fixture";
import { fixtureInstanceId, fixturePermanentId } from "#api/engine/scenario/references";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settleAcrossTimers } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Derived opponent hand-trash trigger before an older pending security watcher", () => {
  it("activates Titamon's hand-trash deletion before Magnamon (X Antibody)'s pending security watcher", async () => {
    const s = setupScenario(fixture, { autoOrderTriggers: false });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: fixturePermanentId("jupitermon-host"),
          instanceId: fixtureInstanceId("jupitermon-card"),
        }),
      ).toEqual({ ok: true });

      for (let step = 0; step < 20; step += 1) {
        const settled = await settleAcrossTimers(() => s.state.pendingDecision !== undefined).then(
          () => true,
          () => false,
        );
        if (!settled) break;
        const pending = s.state.pendingDecision;
        const request = s.decisions.find(({ req }) => req.decisionId === pending?.decisionId)?.req;
        if (request === undefined) {
          await new Promise((resolve) => setImmediate(resolve));
          continue;
        }
        const triggerCardIds = request.options?.triggerCardIds ?? [];
        const response: DecisionResponse =
          request.kind === "orderTriggers"
            ? { kind: "orderTriggers", order: [request.options!.triggerKeys![triggerCardIds.indexOf("BT24-074")]!] }
            : request.kind === "optional"
              ? { kind: "optional", accept: true }
              : ({
                  kind: request.kind,
                  instanceIds: (request.options?.candidateInstanceIds ?? []).slice(0, 1),
                } as DecisionResponse);
        expect(
          s.engine.applyIntent(request.seat, { type: "respondDecision", decisionId: request.decisionId, response }),
        ).toEqual({ ok: true });
      }

      const triggered = s.events.flatMap((event) =>
        event.kind === "effectTriggered" ? [`${event.seat}:${event.sourceCardId}:${event.timing}`] : [],
      );
      expect(triggered.indexOf("1:BT25-084:whenHandTrashed")).toBeGreaterThan(triggered.indexOf("0:BT24-074:OnPlay"));
      expect(triggered.indexOf("1:BT25-084:whenHandTrashed")).toBeLessThan(
        triggered.indexOf("0:BT16-102:whenSecurityRemoved"),
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
