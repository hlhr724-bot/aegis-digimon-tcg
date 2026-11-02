import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/digivolution-watcher-survives-subject-change.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it("keeps both Dokuson digivolution watchers pending after the evolved Digimon is de-digivolved and deleted", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    preferTriggerKeys: ["EX10-052", "EX6-041"],
    preferInstanceIds: preferred,
  });
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  const lucemonId = s.perm("lucemon").permanentId;
  preferred.push(
    s.perm("victim").permanentId,
    s.inst("replacement-diaboromon").instanceId,
    s.perm("lucemon").permanentId,
  );
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("lucemon").permanentId,
      instanceId: s.inst("chaos-mode").instanceId,
      useAlternateCost: true,
    }),
  ).toEqual({ ok: true });
  await settle();

  expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === lucemonId)).toBe(false);
  expect(s.perm("first-dokuson").isSuspended).toBe(true);
  expect(s.perm("second-dokuson").isSuspended).toBe(true);
  expect(s.state.memory).toBe(7);
  expect(s.state.pendingDecision).toBeUndefined();
  advance(s.engine).endMainPhaseIfOpen(0);
  await turn;
});
