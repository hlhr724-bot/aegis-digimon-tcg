import fixture from "../../api/src/engine/scenarios/drill-blocker.fixture";
import { test, expect } from "./scenario-page";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  for (const colorScheme of ["dark", "light"] as const) {
    test(`blocker confirmation supports cancel at ${viewport.width}px in ${colorScheme} mode`, async ({
      scenario,
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await scenario.openFixture(fixture);
      await scenario.resolveUntil((state) => state.combatWindow?.kind === "block");
      await expect(page.getByRole("region", { name: "Block window", exact: true })).toBeVisible();
      const blocker = (await scenario.snapshot()).players[0]!.battleArea.find(
        (permanent) => permanent.topCard.cardId === "BT14-011",
      )!;
      const card = page.locator(`[data-id="${blocker.permanentId}"][role="button"]`);
      await card.click();
      const dialog = page.getByRole("dialog", { name: "Confirm block", exact: true });
      await expect(dialog).toBeVisible();
      expect((await scenario.snapshot()).combatWindow?.kind).toBe("block");
      expect(
        (await scenario.snapshot()).players[0]!.battleArea.find(
          (permanent) => permanent.permanentId === blocker.permanentId,
        )!.isSuspended,
      ).toBe(false);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("region", { name: "Block window", exact: true })).toBeVisible();
      await card.click();
      await dialog.getByRole("button", { name: "Block", exact: true }).click();
      await scenario.resolveUntil((state) => !state.combatWindow && state.players[1]!.battleArea.length === 0);
      expect((await scenario.presentation()).events.filter((event) => event.kind === "blocked")).toEqual([
        expect.objectContaining({ blockerPermanentId: blocker.permanentId }),
      ]);
      await scenario.healthy();
    });
  }
}
