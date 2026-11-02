import fixture from "@api-fixtures/pending-deletion-trash-choice.fixture";
import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("identifies the deleted opponent copy with a pending effect in the trash choice", async ({ scenario, page }) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.hand("Millenniummon");
  await page.getByRole("button", { name: "Digivolve", exact: true }).click();
  const prompt = page.getByRole("region", { name: /DNA Digivolution available/i });
  for (const alias of ["kimeramon", "machinedramon"]) {
    const material = page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId(alias)}"]`);
    if (!(await material.locator(".game-permanent__material-order").count())) {
      await material.click();
    }
  }
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "DNA Digivolve", exact: true }).click();
  let checked = false;
  await scenario.resolveUntil(
    (state) => checked && !state.pendingDecision && state.players[1]!.trash.length === 1,
    async (decision) => {
      if (
        decision.kind === "selectCards" &&
        decision.options.candidateInstanceIds?.includes(refs.instanceId("pending-card"))
      ) {
        expect(decision.options.pendingEffectInstanceIds).toEqual([refs.instanceId("pending-card")]);
        const pending = page.getByRole("dialog").locator(`[data-instance-id="${refs.instanceId("pending-card")}"]`);
        const old = page.getByRole("dialog").locator(`[data-instance-id="${refs.instanceId("old-card")}"]`);
        await expect(pending.getByText("Pending effect", { exact: true })).toBeVisible();
        await expect(old.getByText("Pending effect", { exact: true })).toHaveCount(0);
        await expect(pending).toHaveAccessibleName(/Pending effect/);
        checked = true;
        return { instanceId: refs.instanceId("pending-card") };
      }
      return { accept: true };
    },
  );
  const after = await scenario.snapshot();
  expect(after.players[1]!.trash.map((card) => card.instanceId)).toEqual([refs.instanceId("old-card")]);
  await expect(page.locator(".decision-overlay__pending-effect")).toHaveCount(0);
  await scenario.healthy();
});
