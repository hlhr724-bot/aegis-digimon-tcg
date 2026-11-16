import fixture from "../../api/src/engine/scenarios/play-cost-deletion-watchers-wait-for-play.fixture";
import { test, expect } from "./scenario-page";

test("effects triggered by a play-cost deletion are ordered together after the card is played", async ({
  scenario,
}) => {
  const references = await scenario.openFixture(fixture, "normal", "none");
  const tapirmonId = references.permanentId("tapirmon");
  await scenario.resolveUntil((s) => s.phase === "Main" && s.turnSeat === 0 && !s.pendingDecision);

  await scenario.play("Gizmon: AT", "Digimon");
  let offered: string[] | undefined;
  let playedBeforeOrdering = false;
  await scenario.resolveUntil(
    (s) =>
      !s.pendingDecision &&
      s.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT13-083") &&
      s.players[0]!.trash.some((card) => card.cardId === "BT27-102"),
    async (decision) => {
      if (decision.kind === "orderTriggers" && offered === undefined) {
        offered = [...(decision.options.triggerCardIds ?? [])];
        playedBeforeOrdering = (await scenario.snapshot()).players[0]!.battleArea.some(
          (permanent) => permanent.topCard.cardId === "BT13-083",
        );
        return {};
      }
      if (decision.sourceCardId === "BT27-048") return { accept: false };
      if (decision.sourceCardId === "BT13-083" && decision.options.candidateInstanceIds?.includes(tapirmonId))
        return { instanceId: tapirmonId };
      return { accept: true };
    },
  );

  expect(offered?.sort()).toEqual(["BT13-083", "BT2-070", "BT27-098", "BT27-102"]);
  expect(playedBeforeOrdering).toBe(true);
  const kurata = (await scenario.snapshot()).players[0]!.battleArea.find(
    (permanent) => permanent.permanentId === references.permanentId("kurata"),
  )!;
  expect(kurata.isSuspended).toBe(true);
  await scenario.idle();
  expect(scenario.errors.filter((error) => !error.includes("404 (Not Found)"))).toEqual([]);
});
