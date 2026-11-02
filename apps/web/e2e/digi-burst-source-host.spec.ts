import fixture from "../../api/src/engine/scenarios/drill-digi-burst.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

const hostId = fixturePermanentId("hercules");

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  for (const theme of ["light", "dark"] as const) {
    test(`Digi-Burst opens its sole host directly and can cancel before paying at ${viewport.width}px in ${theme}`, async ({
      scenario,
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((dark) => localStorage.setItem("aegis:darkMode", String(dark)), theme === "dark");
      await scenario.openFixture(fixture, "normal", "none");
      await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
      const initial = await scenario.snapshot();
      const sources = initial.players[0]!.battleArea.find((permanent) => permanent.permanentId === hostId)!.stack;
      const host = page.locator(`[data-drop="perm-you"][data-id="${hostId}"]`);
      await host.click();
      await page.getByRole("button", { name: /^Activate effect:/ }).click();
      await expect(page.getByRole("region", { name: "Choose a Digimon", exact: true })).toHaveCount(0);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Choose another Digimon", exact: true })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await scenario.resolveUntil((state) => !state.pendingDecision);
      const cancelled = await scenario.snapshot();
      expect(cancelled.players[0]!.trash).toHaveLength(0);
      expect(
        cancelled.players[0]!.battleArea.find((permanent) => permanent.permanentId === hostId)!.stack.map(
          (card) => card.instanceId,
        ),
      ).toEqual(sources.map((card) => card.instanceId));
      await host.click();
      await page.getByRole("button", { name: /^Activate effect:/ }).click();
      await expect(dialog).toBeVisible();
      const first = dialog.locator(`[data-instance-id="${sources[0]!.instanceId}"]`);
      const middle = dialog.locator(`[data-instance-id="${sources[1]!.instanceId}"]`);
      const last = dialog.locator(`[data-instance-id="${sources[2]!.instanceId}"]`);
      await expect(first).toBeVisible();
      await expect(middle).toBeVisible();
      await expect(last).toBeVisible();
      const lastBounds = await last.boundingBox();
      const confirmBounds = await dialog.getByRole("button", { name: "Confirm targets", exact: true }).boundingBox();
      expect(lastBounds).not.toBeNull();
      expect(confirmBounds).not.toBeNull();
      expect(confirmBounds!.y - (lastBounds!.y + lastBounds!.height)).toBeLessThan(128);
      const inspect = dialog.getByRole("button", { name: "Open Kunemon", exact: true });
      await expect(inspect).toHaveText("");
      await inspect.click();
      const zoom = page.getByRole("dialog", { name: "Kunemon", exact: true });
      await expect(zoom).toBeVisible();
      await zoom.getByRole("button", { name: "Close", exact: true }).click();
      await expect(first).toHaveAttribute("aria-pressed", "false");
      await first.click();
      await expect(dialog.getByRole("button", { name: "Confirm targets", exact: true })).toBeDisabled();
      await last.click();
      await dialog.getByRole("button", { name: "Confirm targets", exact: true }).click();
      await scenario.resolveUntil((state) => !state.pendingDecision && state.players[0]!.trash.length === 2);
      const final = await scenario.snapshot();
      expect(
        final.players[0]!.battleArea.find((permanent) => permanent.permanentId === hostId)!.stack.map(
          (card) => card.instanceId,
        ),
      ).toEqual([sources[1]!.instanceId]);
      expect(final.players[0]!.trash.map((card) => card.instanceId).sort()).toEqual(
        [sources[0]!.instanceId, sources[2]!.instanceId].sort(),
      );
      await scenario.healthy();
    });
  }
}
