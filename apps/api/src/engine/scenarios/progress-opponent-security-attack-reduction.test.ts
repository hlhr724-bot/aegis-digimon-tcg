import { describe, expect, it } from "vitest";
import { EffectDuration, type Seat } from "@aegis/shared";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/progress-opponent-security-attack-reduction.fixture";
import "#api/cards/EX11/EX11-012";
import "#api/cards/BT1/BT1-016";

describe("Progress against a Security Attack reduction", () => {
  it.each([
    { card: "EX11-012", grantingSeat: 1 as Seat, scope: "permanent", checks: 1 },
    { card: "EX11-012", grantingSeat: 1 as Seat, scope: "player", checks: 1 },
    { card: "EX11-012", grantingSeat: 0 as Seat, scope: "permanent", checks: 0 },
    { card: "EX11-012", grantingSeat: 0 as Seat, scope: "player", checks: 0 },
    { card: "BT1-016", grantingSeat: 1 as Seat, scope: "permanent", checks: 0 },
  ])(
    "$card with $scope ＜Security A. -1＞ from seat $grantingSeat checks $checks security cards",
    async ({ card, grantingSeat, scope, checks }) => {
      const s = setupScenario(
        { ...fixture, board: { ...fixture.board, 0: { ...fixture.board[0], battleArea: [{ card, as: "attacker" }] } } },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      const loop = s.engine.startTurnLoop();
      try {
        await advance(s.engine).waitForMainPhase(0);
        const id = s.perm("attacker").permanentId;
        if (scope === "player") {
          s.engine.continuous.addPlayerKeywordGrant(0, "SecurityAttack", EffectDuration.UntilEachTurnEnd, -1, {
            ownerSeat: grantingSeat,
          });
        } else {
          s.engine.continuous.addKeywordGrant(id, "SecurityAttack", EffectDuration.UntilEachTurnEnd, -1, {
            sourceCardId: "BT26-089",
            sourceSeat: grantingSeat,
            sourceKinds: ["Tamer"],
          });
        }
        expect(s.engine.projection.securityStrikeFor(id)).toBe(0);
        expect(
          s.engine.applyIntent(0, { type: "attack", attackerPermanentId: id, target: { kind: "player" } }),
        ).toEqual({
          ok: true,
        });
        await settle(() => s.events.some((event) => event.kind === "attackEnded") && !s.state.pendingDecision);
        expect(s.state.players[1]!.security).toHaveLength(4 - checks);
        expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(checks);
        expect(s.engine.projection.securityStrikeFor(id)).toBe(0);
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );
});
