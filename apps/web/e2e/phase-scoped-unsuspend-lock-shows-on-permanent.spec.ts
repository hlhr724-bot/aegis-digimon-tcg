import fixture from "../../api/src/engine/scenarios/phase-scoped-unsuspend-lock-shows-on-permanent.fixture";
import { test, expect } from "./scenario-page";

test("a Digimon locked for its next unsuspend phase shows the standing restriction badge", async ({ scenario }) => {
  const { page } = scenario;
  const references = await scenario.openFixture(fixture, "normal", "none");
  const lockedId = references.permanentId("lockedDigimon");
  await scenario.resolveUntil((s) => s.phase === "Main" && s.turnSeat === 0 && !s.pendingDecision);

  await scenario.play("Groundramon", "Digimon");
  await scenario.resolveUntil(
    (s) =>
      !s.pendingDecision &&
      s.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX13-041") &&
      s.players[1]!.battleArea.some((permanent) => permanent.permanentId === lockedId && permanent.isSuspended),
  );

  const locked = (await scenario.snapshot()).players[1]!.battleArea.find(
    (permanent) => permanent.permanentId === lockedId,
  )!;
  expect(locked.cannotUnsuspend).toBe(true);
  await expect(
    page.locator(`[data-id="${lockedId}"] .game-restriction-badge[data-label="Won't unsuspend"]`),
  ).toBeVisible();
  await scenario.healthy();
});
