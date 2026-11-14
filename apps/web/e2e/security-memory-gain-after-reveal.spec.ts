import fixture from "../../api/src/engine/scenarios/security-memory-gain-after-reveal.fixture";
import { test, expect } from "./scenario-page";

test("the memory gauge answers Jack Raid's [Security] only after the card is revealed", async ({ scenario, page }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await expect(page.locator('[aria-label="Memory: +4"]')).toBeAttached();

  await page.evaluate(() => {
    const marks: { revealedAt?: number; gaugeMovedAt?: number } = {};
    (window as unknown as { securityMemoryMarks: typeof marks }).securityMemoryMarks = marks;
    const observer = new MutationObserver(() => {
      const now = performance.now();
      if (
        marks.revealedAt === undefined &&
        document.querySelector('[data-testid="security-clash"] [data-role="revealed"]')
      )
        marks.revealedAt = now;
      if (marks.gaugeMovedAt === undefined && document.querySelector('[aria-label="Memory: +2"]'))
        marks.gaugeMovedAt = now;
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  });

  await scenario.attack(refs.permanentId("attacker"));
  await scenario.resolveUntil(
    (s) => s.players[1]!.trash.some((card) => card.instanceId === refs.instanceId("jackRaid")) && s.memory === 2,
  );
  await expect(page.locator('[aria-label="Memory: +2"]')).toBeAttached();

  const marks = await page.evaluate(
    () =>
      (window as unknown as { securityMemoryMarks: { revealedAt?: number; gaugeMovedAt?: number } })
        .securityMemoryMarks,
  );
  expect(marks.revealedAt).toBeDefined();
  expect(marks.gaugeMovedAt).toBeDefined();
  expect(marks.gaugeMovedAt!).toBeGreaterThan(marks.revealedAt!);
  await scenario.healthy();
});
