import fixture from "@api-fixtures/locked-attack-target-skips-redirection.fixture";
import { test, expect } from "./scenario-page";

test("a locked attack skips the redirect prompt and explains the result in the play log", async ({
  scenario,
  page,
}) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.attack(refs.permanentId("lockedAttacker"));
  await scenario.resolveUntil(
    (state) => !state.pendingDecision && state.players[1]!.securityCount === 2,
    () => {
      throw new Error("A locked attack must not offer a redirect decision");
    },
  );
  const events = (await scenario.presentation()).events;
  expect(events).toContainEqual(expect.objectContaining({ kind: "effectHadNoEffect", sourceCardId: "BT25-039" }));
  expect(events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT25-039")).toBe(false);
  await page.getByRole("button", { name: "Match log", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Play log", exact: true })).toContainText(
    "Sirenmon's effect had no effect",
  );
  await scenario.healthy();
});
