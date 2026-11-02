import "#api/cards/index";
import { describe, expect, it } from "vitest";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/trashed-digivolution-card-regains-once-per-turn.fixture";

async function respond(s: EngineSetup, response: DecisionResponse): Promise<void> {
  await settle(() => s.state.pendingDecision !== undefined);
  const { decisionId } = s.state.pendingDecision!;
  expect(s.engine.applyIntent(0, { type: "respondDecision", decisionId, response })).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.decisionId !== decisionId);
  await settle();
}

async function digivolve(s: EngineSetup, permanent: string, card: string): Promise<void> {
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm(permanent).permanentId,
      instanceId: s.inst(card).instanceId,
    }),
  ).toEqual({ ok: true });
}

describe("a card trashed from digivolution cards leaves the field", () => {
  it("offers its [Once Per Turn] [When Digivolving] effect again after it returns the same turn", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: false, autoSelectCards: false });
    const loop = s.engine.runOneTurn();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await respond(s, { kind: "optional", accept: false });
      await advance(s.engine).waitForMainPhase(0);

      await digivolve(s, "firstLadyDevimon", "beelStarmon");
      await respond(s, { kind: "optional", accept: true });
      await respond(s, { kind: "selectCards", instanceIds: [s.inst("firstDerBlitz").instanceId] });
      await respond(s, { kind: "chooseTargets", instanceIds: [s.perm("firstTarget").permanentId] });
      await respond(s, { kind: "optional", accept: false });

      await digivolve(s, "firstLadyDevimon", "xAntibodyBeelStarmon");
      await respond(s, { kind: "optional", accept: false });
      await respond(s, { kind: "optional", accept: true });
      await respond(s, { kind: "chooseTargets", instanceIds: [s.perm("secondTarget").permanentId] });
      expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("beelStarmon").instanceId);

      const asunaEffect = observe(s.engine).activatableEffects(s.perm("asuna"))[0]!;
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.inst("asuna").instanceId,
          effectKey: asunaEffect.effectKey,
        }),
      ).toEqual({ ok: true });
      await respond(s, { kind: "selectCards", instanceIds: [s.inst("asunaCost").instanceId] });
      await respond(s, { kind: "optional", accept: true });
      await respond(s, { kind: "chooseOption", optionIndex: 1 });
      expect(s.perm("secondLadyDevimon").topCard.instanceId).toBe(s.inst("beelStarmon").instanceId);

      await settle(() => s.state.pendingDecision !== undefined);
      expect(s.state.pendingDecision!.kind).toBe("optional");
      expect(JSON.parse(s.state.pendingDecision!.payloadJson)).toMatchObject({
        timing: "WhenDigivolving",
        effectKey: "BT25-085/ir-shared-0",
      });
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
