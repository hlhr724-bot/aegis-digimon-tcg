import fixtureSourceStripStacks from "../../api/src/engine/scenarios/source-strip-stacks.fixture";
import { fixturePermanentId, fixtureInstanceId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

const firstHost = fixturePermanentId("opponent-source-strip-first");
const secondHost = fixturePermanentId("opponent-source-strip-second");
const lockedHost = fixturePermanentId("opponent-source-strip-locked");
const firstSource = fixtureInstanceId("opponent-source-source-strip-first-0-card");
const secondSource = fixtureInstanceId("opponent-source-source-strip-second-0-card");

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`source stripping identifies opponent stacks and preserves picks at ${viewport.width}px in ${colorScheme}`, async ({
      scenario,
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await page.addInitScript((dark) => localStorage.setItem("aegis:darkMode", String(dark)), colorScheme === "dark");
      await scenario.openFixture(fixtureSourceStripStacks);
      await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
      const initial = await scenario.snapshot();
      await scenario.play("Gekomon", "Digimon");
      const hostPrompt = page.getByTestId("board-prompt");
      await expect(hostPrompt).toContainText("Choose a Digimon");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(JSON.parse((await scenario.snapshot()).pendingDecision!.payloadJson).max).toBe(2);

      // Inspect the protected stack without choosing any of its sources.
      await page.locator(`[data-drop="perm-opp"][data-id="${lockedHost}"]`).click();
      const lockedDialog = page.getByRole("dialog");
      await expect(
        lockedDialog.locator(`[data-instance-id="${fixtureInstanceId("opponent-source-source-strip-locked-0-card")}"]`),
      ).toHaveAccessibleName(/Maquinamon/);
      await lockedDialog.getByRole("button", { name: "Choose another Digimon", exact: true }).click();
      await expect(lockedDialog).toHaveCount(0);

      await page.locator(`[data-drop="perm-opp"][data-id="${firstHost}"]`).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const first = dialog.locator(`[data-instance-id="${firstSource}"]`);
      await expect(first).toHaveAccessibleName(/Greymon/);
      await expect(dialog.getByRole("heading", { name: "Greymon", exact: true })).toBeVisible();
      await expect(first).toBeInViewport({ ratio: 1 });
      await expect(dialog.locator(`[data-instance-id="${secondSource}"]`)).toHaveCount(0);
      await first.click();
      await expect(dialog.getByRole("button", { name: "Confirm targets", exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: "Choose another Digimon", exact: true }).click();
      await expect(dialog).toHaveCount(0);

      await page.locator(`[data-drop="perm-opp"][data-id="${secondHost}"]`).click();
      const second = dialog.locator(`[data-instance-id="${secondSource}"]`);
      await expect(second).toHaveAccessibleName(/MetalGreymon/);
      await expect(dialog.getByRole("heading", { name: "MetalGreymon", exact: true })).toBeVisible();
      await expect(second).toBeInViewport({ ratio: 1 });
      await second.click();
      await expect(dialog.getByRole("button", { name: "Confirm targets", exact: true })).toBeEnabled();

      // Return once more to prove that browsing stacks retains each physical card identity.
      await dialog.getByRole("button", { name: "Choose another Digimon", exact: true }).click();
      await page.locator(`[data-drop="perm-opp"][data-id="${firstHost}"]`).click();
      await expect(first).toHaveAttribute("aria-pressed", "true");
      await dialog.getByRole("button", { name: "Confirm targets", exact: true }).click();
      await scenario.resolveUntil((state) => !state.pendingDecision && state.players[1]!.trash.length === 2);
      const final = await scenario.snapshot();
      expect(final.players[1]!.trash.map((card) => card.instanceId).sort()).toEqual([firstSource, secondSource].sort());
      for (const id of [firstHost, secondHost]) {
        expect(
          final.players[1]!.battleArea.find((permanent) => permanent.permanentId === id)!.stack.map(
            (card) => card.cardId,
          ),
        ).toEqual(["BT1-010"]);
      }
      expect(final.players[1]!.battleArea.find((permanent) => permanent.permanentId === lockedHost)!.stack).toEqual(
        initial.players[1]!.battleArea.find((permanent) => permanent.permanentId === lockedHost)!.stack,
      );
      expect(final.memory).toBe(initial.memory - 4);
      await scenario.healthy();
    });
  }
}
