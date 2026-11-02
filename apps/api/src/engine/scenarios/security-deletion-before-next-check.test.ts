import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/security-deletion-before-next-check.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

describe("security deletion before the next check", () => {
  it.each([false, true])(
    "resolves deletion before the next check with an effect-directed attack=%s",
    async (directed) => {
      const preferred: string[] = [];
      const s = setupScenario(fixture, {
        autoAcceptOptional: true,
        autoSelectCards: true,
        declineDigiXros: true,
        preferInstanceIds: preferred,
      });
      preferred.push(s.perm("attacker").permanentId, s.perm("recruiter").permanentId);
      await s.ready();
      s.state.phase = Phase.Main;
      s.state.memory = 10;
      const result = directed
        ? s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("director").instanceId })
        : s.engine.applyIntent(0, {
            type: "attack",
            attackerPermanentId: s.perm("attacker").permanentId,
            target: { kind: "player" },
          });
      expect(result).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") &&
          !observe(s.engine).isAttacking() &&
          !s.state.pendingDecision,
      );
      const reveals = s.events.flatMap((event, index) => (event.kind === "securityRevealed" ? [index] : []));
      expect(reveals).toHaveLength(2);
      const recruitment = s.events.findIndex(
        (event) =>
          event.kind === "effectResolved" &&
          event.sourceCardId === "BT19-063" &&
          event.effectKey === "BT19-063/ir-11-0",
      );
      expect(recruitment).toBeGreaterThan(reveals[0]!);
      expect(recruitment).toBeLessThan(reveals[1]!);
      expect(
        s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === s.perm("attacker").permanentId),
      ).toBe(true);
    },
  );
});
