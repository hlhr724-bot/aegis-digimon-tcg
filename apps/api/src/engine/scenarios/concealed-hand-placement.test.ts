import "#api/cards/EX10/EX10-059";
import { expect, it } from "vitest";
import { Phase } from "@aegis/shared";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import fixture from "./concealed-hand-placement.fixture.js";

it("explicitly conceals every opponent hand candidate when placing one without looking", async () => {
  const s = setupScenario(fixture);
  await s.ready();
  s.state.phase = Phase.Main;
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("source").permanentId,
      instanceId: s.inst("darkness").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "selectCards");
  const options = JSON.parse(s.state.pendingDecision!.payloadJson);
  expect(options.candidateInstanceIds).toEqual(
    expect.arrayContaining([s.inst("known").instanceId, s.inst("hidden").instanceId]),
  );
  expect(options.visibleInstanceIds).toEqual([]);
  expect(options.visibleCards).toEqual([]);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response: { kind: "selectCards", instanceIds: [s.inst("known").instanceId] },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("host").stack.some((card) => card.instanceId === s.inst("known").instanceId));
  expect(s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("known").instanceId)).toBe(false);
  s.engine.applyIntent(0, { type: "surrender" });
});
