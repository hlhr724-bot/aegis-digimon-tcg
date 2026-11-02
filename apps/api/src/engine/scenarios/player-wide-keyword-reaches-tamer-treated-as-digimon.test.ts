import { describe, expect, it } from "vitest";
import "../../cards/BT26/BT26-083.js";
import "../../cards/BT12/BT12-034.js";
import "../../cards/BT12/BT12-092.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";

function fixture() {
  return setupEngine(
    {
      0: {
        battleArea: [
          { card: "BT12-092", as: "marcus" },
          { card: "BT12-034", as: "agumon" },
        ],
        deck: ["BT1-009", "BT1-010", "BT1-011"],
        security: ["BT1-009", "BT1-010"],
      },
      1: {
        battleArea: [{ card: "BT26-083", as: "junomon" }],
        deck: ["BT1-009", "BT1-010", "BT1-011"],
        security: ["BT1-009", "BT1-010", "BT1-011"],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
}

describe("player-wide keyword grant reaches a Tamer later treated as a Digimon", () => {
  it("gives Marcus Damon, treated as a Digimon after Junomon's deletion, Junomon's Security A. -1", async () => {
    const s = fixture();
    await s.ready();
    const advancer = advance(s.engine);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const junomonTurn = s.engine.runOneTurn();
    await advancer.waitForMainPhase(1);
    expect(await advancer.verb.deletePermanent([s.perm("junomon").permanentId])).toBe(1);
    await settle(() => s.state.pendingDecision === undefined);
    advancer.endMainPhaseIfOpen(1);
    await junomonTurn;

    s.state.turnSeat = 0;
    s.state.memory = 3;
    const marcusTurn = s.engine.runOneTurn();
    await advancer.waitForMainPhase(0);

    expect(s.perm("marcus").currentDP).toBe(3000);
    expect(s.perm("agumon").securityAttack).toBe(0);
    expect(s.perm("marcus").securityAttack).toBe(0);

    const securityBefore = s.state.players[1]!.security.length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("marcus").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await advancer.finishAttack();
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(securityBefore);

    advancer.endMainPhaseIfOpen(0);
    await marcusTurn;
  });
});
