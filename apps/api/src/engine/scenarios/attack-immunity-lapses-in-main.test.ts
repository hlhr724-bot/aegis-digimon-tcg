import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/attack-immunity-lapses-in-main.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

it("restores effect vulnerability in the same Main phase after an immune security attack", async () => {
  const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true });
  s.state.phase = Phase.Main;
  await s.ready();
  expect(s.perm("ouryuken").immuneToOpponentOptionEffects).toBe(false);
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("ouryuken").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
  expect(s.perm("ouryuken").immuneToOpponentOptionEffects).toBe(true);
  await advance(s.engine).finishAttack();
  expect(
    s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === s.perm("ouryuken").permanentId),
  ).toBe(true);
  expect(s.state.players[1]!.security).toHaveLength(1);
  expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("ST1-16");
  expect(s.state.phase).toBe(Phase.Main);
  expect(s.state.memory).toBe(3);
  expect(observe(s.engine).isAttacking()).toBe(false);
  expect(observe(s.engine).isRestrictedByEffect(s.perm("ouryuken"), "beAffected", "Option")).toBe(false);
  expect(s.perm("ouryuken")).toMatchObject({
    immuneToOpponentDigimonEffects: false,
    immuneToOpponentOptionEffects: false,
    immuneToOpponentTamerEffects: false,
  });
  expect(s.state.pendingDecision).toBeUndefined();
});
