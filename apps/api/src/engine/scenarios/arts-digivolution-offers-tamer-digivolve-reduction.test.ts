import type { Intent } from "@aegis/shared/protocol/intents";
import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/arts-digivolution-offers-tamer-digivolve-reduction.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { drainMicrotasks, settle } from "#api/engine/testkit/harness";

type Scenario = ReturnType<typeof setupScenario>;

const routes: [string, (s: Scenario) => Intent, string, number][] = [
  [
    "a hand use",
    (s) => ({ type: "playCard", instanceId: s.inst("mirage").instanceId, useAs: "option" }),
    "bottom-under",
    5,
  ],
  [
    "MachGaogamon's free use",
    (s) => ({ type: "attack", attackerPermanentId: s.perm("arts-base").permanentId, target: { kind: "player" } }),
    "third-under",
    10,
  ],
];

it.each(routes)(
  "offers Thomas's DATA SQUAD digivolve reduction when Arts Digivolve follows %s",
  async (_route, intent, paidUnder, memory) => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, intent(s))).toEqual({ ok: true });
      await drainMicrotasks();
      await settle(() => s.state.pendingDecision === undefined && s.perm("arts-base").topCard.cardId === "BT27-032");
      expect(s.perm("arts-base").topCard.cardId).toBe("BT27-032");
      expect(s.state.memory).toBe(memory);
      expect(
        s.decisions.filter(({ req }) => req.promptText.startsWith("When any of your Digimon would digivolve")),
      ).toHaveLength(1);
      const paid = s.inst(paidUnder).instanceId;
      expect(s.perm("thomas").stack.map(({ instanceId }) => instanceId)).toContain(s.inst("top-under").instanceId);
      expect(s.perm("thomas").stack.map(({ instanceId }) => instanceId)).not.toContain(paid);
      expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(paid);
      expect(s.state.players[1]!.hand.map(({ cardId }) => cardId)).toContain("BT1-010");
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
