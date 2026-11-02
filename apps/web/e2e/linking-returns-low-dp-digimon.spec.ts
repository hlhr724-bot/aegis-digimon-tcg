import fixture from "../../api/src/engine/scenarios/linking-returns-low-dp-digimon.fixture";
import { test, expect } from "./scenario-page";

test("DoGatchmon presents its link effect and returns the chosen low-DP target", async ({ scenario, page }) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  const linkCard = page.getByTestId("hand").getByRole("button", { name: "Select DoGatchmon", exact: true });
  await linkCard.focus();
  await linkCard.press("Enter");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId("host")}"]`).click();
  let sawLinkEffect = false;
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      !state.players[1]!.battleArea.some((p) => p.permanentId === refs.permanentId("eligible")),
    (decision) => {
      if (decision.kind === "chooseTargets" && decision.sourceCardId === "ST22-12") {
        sawLinkEffect = true;
        expect(decision.options.timing).toBe("WhenLinking");
        return { instanceId: refs.permanentId("eligible") };
      }
      return {};
    },
  );
  expect(sawLinkEffect).toBe(true);
  const final = await scenario.snapshot();
  expect(final.memory).toBe(3);
  expect(final.players[1]!.battleArea.map((p) => p.permanentId)).toEqual([
    refs.permanentId("ineligible"),
    refs.permanentId("otherEligible"),
  ]);
  expect(final.players[1]!.deckCount).toBe(3);
  expect(
    final.players[0]!.battleArea.find((p) => p.permanentId === refs.permanentId("host"))!.linked.map(
      (c) => c.instanceId,
    ),
  ).toEqual([refs.instanceId("linkCard")]);
  await scenario.healthy();
});
