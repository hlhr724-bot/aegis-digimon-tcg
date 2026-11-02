import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/pending-end-turn-attack-during-dna.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";

it("resolves Tai and Matt's pending end-turn attack inside an inherited-DNA attack even after Omnimon unsuspends", async () => {
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoOrderTriggers: true,
    preferTriggerKeys: ["BT22-017"],
  });
  await s.ready();
  await advance(s.engine).runTurn(0);

  const omnimon = s.state.players[0]!.battleArea.find(
    ({ topCard }) => topCard.instanceId === s.inst("omnimon").instanceId,
  );
  expect(omnimon?.topCard.cardId).toBe("BT22-015");
  expect(omnimon?.isSuspended).toBe(false);
  expect(omnimon?.stack.map(({ cardId }) => cardId)).toEqual(
    expect.arrayContaining(["BT22-013", "EX4-038", "BT22-026", "BT22-017"]),
  );
  expect(s.events.filter(({ kind }) => kind === "attackDeclared")).toHaveLength(1);
  expect(s.events.filter(({ kind }) => kind === "attackEnded")).toHaveLength(1);
  expect(s.state.players[1]!.security).toHaveLength(3);

  const taiQuestions = s.decisions.filter(
    ({ req }) => req.sourceCardId === "BT17-081" && req.options?.selectionContext === "attackSource",
  );
  expect(taiQuestions).toHaveLength(1);
  expect(taiQuestions[0]!.req.options?.promptKey).toBe("attackAlreadyResolving");
  const attackStart = s.events.findIndex(({ kind }) => kind === "attackDeclared");
  const taiActivation = s.events.findIndex(
    (event) =>
      event.kind === "effectTriggered" && event.sourceCardId === "BT17-081" && event.printedTiming === "EndOfYourTurn",
  );
  const securityCheck = s.events.findIndex(({ kind }) => kind === "securityChecked");
  expect(taiActivation).toBeGreaterThan(attackStart);
  expect(securityCheck).toBeGreaterThan(taiActivation);
  expect(s.state.pendingDecision).toBeUndefined();
  expect(s.state.combatWindow).toBeUndefined();
  expect(s.engine.effectResolutionDepth).toBe(0);
});
