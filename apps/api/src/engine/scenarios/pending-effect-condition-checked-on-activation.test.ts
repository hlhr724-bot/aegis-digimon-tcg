import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { createPendingEffectConditionFixture } from "#api/engine/scenarios/pending-effect-condition-checked-on-activation.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

async function deleteRavemonInBattle(opponentHandSize: number) {
  const s = setupScenario(createPendingEffectConditionFixture({ opponentHandSize }), {
    autoAcceptOptional: true,
    autoSelectCards: true,
    preferTriggerKeys: ["BT26-072"],
  });
  await s.ready();
  s.state.phase = Phase.Main;
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("ravemon").permanentId,
      target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
    }),
  ).toEqual({ ok: true });
  await settle(
    () =>
      !observe(s.engine).isAttacking() &&
      s.state.pendingDecision === undefined &&
      s.state.players[0]!.trash.some((card) => card.cardId === "BT27-083"),
  );
  return s;
}

describe("a pending effect's board condition", () => {
  it("is checked when the effect activates, after an earlier pending effect changed the board", async () => {
    const s = await deleteRavemonInBattle(8);

    expect(s.state.players[1]!.hand).toHaveLength(7);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT27-074"]);
    const triggered = s.events.flatMap((event) => (event.kind === "effectTriggered" ? [event.sourceCardId] : []));
    expect(triggered.indexOf("BT26-072")).toBeGreaterThan(-1);
    expect(triggered.indexOf("BT27-083", triggered.indexOf("BT26-072"))).toBeGreaterThan(-1);
  });

  it("still does nothing when the condition is false on activation", async () => {
    const s = await deleteRavemonInBattle(9);

    expect(s.state.players[1]!.hand).toHaveLength(8);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT27-074");
  });
});
