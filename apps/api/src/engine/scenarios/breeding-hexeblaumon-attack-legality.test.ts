import { expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

it.each(["BT5-032", "EX7-023"])("does not apply %s's source-less attack restriction from breeding", async (card) => {
  for (const breeding of [true, false]) {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
        1: {
          security: ["BT1-009"],
          ...(breeding ? { breeding: { card, as: "hexeblaumon" } } : { battleArea: [{ card, as: "hexeblaumon" }] }),
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    });
    expect(result.ok).toBe(breeding);
    await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
  }
});
