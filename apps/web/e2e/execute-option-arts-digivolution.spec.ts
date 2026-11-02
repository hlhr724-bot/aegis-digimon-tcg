import fixture from "@api-fixtures/execute-option-arts-digivolution.fixture";
import { test, expect } from "@e2e/scenario-page";

test.use({ holdBotAfterTurn: 1 });

test("offers Arts Digivolve after an Option used during an Execute attack", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.play("LadyDevimon", "Digimon");
  let artsOffers = 0;
  await scenario.resolveUntil(
    (state) => state.players[0]!.battleArea.some((host) => host.topCard.instanceId === refs.instanceId("flyBullet")),
    (decision) => {
      if (decision.promptText.includes("Arts Digivolve")) {
        artsOffers += 1;
        return { instanceId: refs.instanceId("ladyDevimon") };
      }
      if (decision.kind === "selectCards" && decision.options.selectionContext === "attackTarget") {
        return { instanceId: "player" };
      }
      if (
        decision.kind === "selectCards" &&
        decision.sourceCardId === "BT25-083" &&
        decision.options.visibleCards?.some((card) => card.cardId === "BT25-085")
      ) {
        return { instanceId: refs.instanceId("flyBullet") };
      }
      return {};
    },
  );
  const after = await scenario.snapshot();
  const host = after.players[0]!.battleArea.find(
    (permanent) => permanent.topCard.instanceId === refs.instanceId("flyBullet"),
  );
  expect(host?.topCard.cardId).toBe("BT25-085");
  expect(artsOffers).toBe(1);
  const presentation = await scenario.presentation();
  expect(
    presentation.events.filter((event) => event.kind === "digivolved" && event.cardId === "BT25-085"),
  ).toHaveLength(1);
  expect(presentation.gateExpiries).toEqual([]);
  expect(presentation.steps.filter((step) => step.failed)).toEqual([]);
  await scenario.resolveUntil(
    (state) => state.turnSeat === 1 && !state.pendingDecision && !state.combatWindow,
    () => ({ accept: false }),
  );
  const settled = await scenario.snapshot();
  expect(settled.players[0]!.trash.map((card) => card.instanceId)).toContain(refs.instanceId("flyBullet"));
  expect(settled.players[0]!.trash.map((card) => card.instanceId)).toContain(refs.instanceId("ladyDevimon"));
  await scenario.healthy();
});
