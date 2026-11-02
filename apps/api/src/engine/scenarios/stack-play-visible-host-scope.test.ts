import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import thisDigimonFixture from "#api/engine/scenarios/this-digimon-stack-play-host-scope.fixture";
import hostFilterFixture from "#api/engine/scenarios/host-filter-stack-play-scope.fixture";

describe("playing from digivolution cards shows only the stacks the effect can reach", () => {
  it("shows only the Cracker Fang host's stack when playing Eiji from this Digimon", async () => {
    const s = setupScenario(thisDigimonFixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferTriggerKeys: ["BT17-091"],
    });
    await s.ready();
    const fangHostStack = s.perm("fang-host").stack.map(({ instanceId }) => instanceId);
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Main);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;

    const selection = s.decisions.find(({ req }) => req.kind === "selectCards" && req.sourceCardId === "BT17-091")?.req;
    expect(selection?.options?.candidateInstanceIds).toEqual([
      s.inst("cracker-fang").instanceId,
      s.inst("fang-host-eiji").instanceId,
    ]);
    expect(selection?.options?.visibleInstanceIds).toEqual(fangHostStack);
    expect(selection?.options?.visibleCards?.map(({ instanceId }) => instanceId)).toEqual(fangHostStack);
  });

  it("shows only blue Digimon's stacks when MegaSeadramon plays from a blue Digimon", async () => {
    const s = setupScenario(hostFilterFixture, { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    s.state.phase = Phase.Main;
    const blueStacks = [s.perm("megaseadramon"), s.perm("blue-host")].flatMap(({ stack }) =>
      stack.map(({ instanceId }) => instanceId),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("megaseadramon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);

    const selection = s.decisions.find(({ req }) => req.kind === "selectCards" && req.sourceCardId === "EX3-022")?.req;
    expect(selection?.options?.candidateInstanceIds).toEqual([
      s.inst("megaseadramon-source").instanceId,
      s.inst("blue-host-source").instanceId,
    ]);
    expect(selection?.options?.visibleInstanceIds).toEqual(blueStacks);
  });
});
