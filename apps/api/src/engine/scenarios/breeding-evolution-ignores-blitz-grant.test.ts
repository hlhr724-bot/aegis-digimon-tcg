import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/breeding-evolution-ignores-blitz-grant.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

it("evolves in breeding without presenting or granting Takato's battle-area Blitz effect", async () => {
  const s = setupScenario(fixture, { autoOrderTriggers: false });
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("growlmon").permanentId,
      instanceId: s.inst("wargrowlmon").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle();
  expect(s.state.players[0]!.breeding?.topCard.cardId).toBe("BT12-016");
  expect(s.state.players[0]!.breeding?.keywords).not.toContain("Blitz");
  expect(s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX2-056")).toEqual([]);
  expect(s.state.pendingDecision).toBeUndefined();
});
