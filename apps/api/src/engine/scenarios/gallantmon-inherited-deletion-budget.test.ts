import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/gallantmon-inherited-deletion-budget.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it.each([true, false])("applies Growlmon's numeric deletion bonus only while inherited (%s)", async (hasBonus) => {
  const prepared = structuredClone(fixture);
  const base = prepared.board[0]?.battleArea?.[0];
  if (!hasBonus && typeof base === "object") {
    base.under = [];
  }
  const s = setupScenario(prepared, {
    autoSelectCards: true,
    autoAcceptOptional: true,
    declinePrompts: ["Attack"],
    autoOrderTriggers: true,
  });
  await s.ready();
  const loop = s.engine.runOneTurn();
  try {
    await advance(s.engine).waitForMainPhase(0);
    const target = s.perm("twelve-thousand").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("evolution-base").permanentId,
        instanceId: s.inst("gallantmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.pendingDecision && s.state.players[1]!.battleArea.length === (hasBonus ? 0 : 1));
    const budgetChoice = s.decisions.find(({ req }) => req.options?.maxTotalDP !== undefined)?.req;
    if (hasBonus) {
      expect(budgetChoice?.options?.maxTotalDP).toBe(12000);
      expect(budgetChoice?.options?.candidateInstanceIds).toEqual([target]);
    } else {
      expect(budgetChoice).toBeUndefined();
      expect(s.state.players[1]!.battleArea[0]!.currentDP).toBe(13000);
    }
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(
      s.events.filter((e) => e.kind === "effectTriggered" && e.sourceCardId === "EX13-013" && e.isInherited),
    ).toHaveLength(1);
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
