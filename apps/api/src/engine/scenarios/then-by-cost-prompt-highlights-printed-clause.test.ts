import { expect, it } from "vitest";
import "#api/cards/index";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/then-by-cost-prompt-highlights-printed-clause.fixture";
import { settle } from "#api/engine/testkit/harness";

it("highlights the whole printed clause when asking a later Then-by-cost clause of an Option", async () => {
  const s = setupScenario(fixture);
  s.state.phase = Phase.Main;
  await s.ready();
  try {
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("habakirimon").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const payload = JSON.parse(s.state.pendingDecision!.payloadJson);
    expect(payload.effectKey).toMatch(/^BT25-043\//);
    expect(payload.effectText).toContain("Then, by trashing your top security card");
    expect(payload.effectTextEmphasis).toBe(
      "Then, by trashing your top security card, all of your opponent's Digimon get -5000 DP for the turn.",
    );
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
  }
});
