import fixture from "../../api/src/engine/scenarios/by-condition-paid-while-effect-plays-prohibited.fixture";
import { test, expect } from "./scenario-page";

test("KingEtemon offers returning 10 cards from the trash while Crimson Blaze forbids effect plays", async ({
  scenario,
}) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  const chuumonIds = Array.from({ length: 10 }, (_, index) => refs.instanceId(`chuumon${index}`));

  await scenario.attack(refs.permanentId("attacker"));
  await scenario.resolveUntil(
    (s) =>
      s.players[1]!.trash.some((card) => card.instanceId === refs.instanceId("crimsonBlaze")) &&
      !s.pendingDecision &&
      !s.combatWindow,
  );

  await scenario.play("KingEtemon", "Digimon");
  let offeredReturn = false;
  await scenario.resolveUntil(
    (s) => s.players[0]!.trash.length === 0,
    (decision) => {
      offeredReturn ||= /return/i.test(JSON.stringify(decision.options)) || /return/i.test(decision.promptText ?? "");
      return { accept: true, instanceIds: chuumonIds };
    },
  );

  expect(offeredReturn).toBe(true);
  const final = await scenario.snapshot();
  expect(final.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
    refs.instanceId("kingEtemon"),
  );
  expect(final.players[0]!.battleArea).toHaveLength(2);
  expect(final.players[0]!.trash).toHaveLength(0);
  await scenario.healthy();
});
