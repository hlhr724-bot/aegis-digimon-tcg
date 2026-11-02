import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { expect, it } from "vitest";
import "#api/cards/index";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/option-main-prompt-highlights-resolving-clause.fixture";
import { drainMicrotasks, settle } from "#api/engine/testkit/harness";

const printedMain =
  "[Main] You may suspend 2 of your opponent's Digimon or Tamers. Then, 3 of their Digimon or Tamers can't unsuspend until their turn ends.";

it("emphasises the suspend clause, then the unsuspend-lock clause, while resolving Ceresmon's [Main]", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: false, autoSelectCards: false, autoOrderTriggers: false });
  s.state.phase = Phase.Main;
  await s.ready();
  const pendingRequest = () =>
    s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision?.decisionId)!.req;
  const respond = async (response: DecisionResponse) => {
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response,
      }),
    ).toEqual({ ok: true });
    await drainMicrotasks();
    await settle(() => s.state.pendingDecision !== undefined);
  };
  const enemies = ["first-enemy", "second-enemy", "third-enemy", "fourth-enemy"].map(
    (alias) => s.perm(alias).permanentId,
  );
  try {
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ceresmon").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision !== undefined);
    expect(pendingRequest().kind).toBe("optional");
    await respond({ kind: "optional", accept: true });

    const suspendTargets = pendingRequest();
    expect(suspendTargets.kind).toBe("chooseTargets");
    expect(suspendTargets.options).toMatchObject({
      effectText: printedMain,
      effectTextEmphasis: "[Main] You may suspend 2 of your opponent's Digimon or Tamers.",
    });
    await respond({ kind: "chooseTargets", instanceIds: enemies.slice(0, 2) });

    const lockTargets = pendingRequest();
    expect(lockTargets.kind).toBe("chooseTargets");
    expect(lockTargets.options).toMatchObject({
      effectText: printedMain,
      effectTextEmphasis: "Then, 3 of their Digimon or Tamers can't unsuspend until their turn ends.",
    });
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
  }
});
