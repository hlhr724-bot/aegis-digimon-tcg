import { Phase } from "@aegis/shared/schema/enums";
import { expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/pending-deletion-trash-choice.fixture";
import "#api/cards/index";

it("marks only the newly deleted copy while Millenniummon chooses an opposing trash card", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true });
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("kimeramon").permanentId, s.perm("machinedramon").permanentId],
        instanceId: s.inst("millennium").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const request = s.decisions.at(-1)!.req;
    expect(request.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.inst("old-card").instanceId, s.inst("pending-card").instanceId]),
    );
    expect(request.options?.pendingEffectInstanceIds).toEqual([s.inst("pending-card").instanceId]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("pending-card").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.engine.pendingEffectReaders.size === 0);
    expect(s.state.players[1]!.deck[0]?.instanceId).toBe(s.inst("pending-card").instanceId);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([s.inst("old-card").instanceId]);
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT3-047")).toBe(false);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
