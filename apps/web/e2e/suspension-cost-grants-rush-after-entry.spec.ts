import fixture from "../../api/src/engine/scenarios/suspension-cost-grants-rush-after-entry.fixture";
import { test, expect } from "./scenario-page";

for (const digivolve of [false, true]) {
  test(`Airdramon offers Rush after paying for ${digivolve ? "evolution" : "play"}`, async ({ scenario }) => {
    const refs = await scenario.openFixture(fixture, "normal", "none");
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    const symbareId = refs.instanceId("symbare");
    if (digivolve) {
      await scenario.evolve("SymbareAngoramon", refs.permanentId("base"));
    } else {
      await scenario.play("SymbareAngoramon", "Digimon");
    }
    let rushOffered = false;
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === symbareId && permanent.keywords.includes("Rush"),
        ),
      (decision) => {
        if (decision.kind === "chooseTargets") {
          if (decision.sourceCardId === "LM-009") {
            rushOffered = true;
            expect(decision.options.candidateInstanceIds).not.toContain(refs.permanentId("unrelated"));
          }
          return { instanceId: symbareId };
        }
        return { accept: true };
      },
    );
    expect(rushOffered).toBe(true);
    const state = await scenario.snapshot();
    const entrant = state.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === symbareId)!;
    expect(
      state.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("airdramon"))!
        .isSuspended,
    ).toBe(true);
    expect(state.memory).toBe(digivolve ? 8 : 5);
    await scenario.attack(entrant.permanentId);
    await scenario.resolveUntil((position) => !position.pendingDecision && position.players[1]!.securityCount === 2);
    await scenario.healthy();
  });
}
