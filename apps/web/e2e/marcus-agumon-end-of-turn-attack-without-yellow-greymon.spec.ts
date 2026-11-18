import fixture from "../../api/src/engine/scenarios/marcus-agumon-end-of-turn-attack-without-yellow-greymon.fixture";
import { test, expect } from "./scenario-page";

test("Marcus Damon & Agumon offers its end-of-turn attack without a yellow Greymon", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision);
  await scenario.page.getByRole("button", { name: /^End turn$/i }).click();

  const prompts: string[] = [];
  await scenario.resolveUntil(
    (state) => state.players[1]!.securityCount === 2 && !state.pendingDecision && !state.combatWindow,
    (decision) => {
      prompts.push(decision.options.effectTextPart ?? decision.promptText ?? "");
      return decision.kind === "chooseTargets" ? { instanceId: refs.permanentId("redDigimon") } : { accept: true };
    },
    30_000,
  );

  expect(prompts).toContain("Then, 1 of your Digimon may attack.");
  await scenario.healthy();
});
