import prepared0 from "../../api/src/engine/scenarios/execute-replacement.fixture";
import prepared1 from "../../api/src/engine/scenarios/ordinary-replacement.fixture";
import { fixtureVariant, fixtureInstanceId, fixturePermanentId } from "../../api/src/engine/scenario/references";

const preparedFixtures = { "execute-replacement": prepared0, "ordinary-replacement": prepared1 };

import { test, expect, type DecisionPolicy } from "./scenario-page";

test.use({ holdBotAfterTurn: 2 });

const MATERIALS = ["BT26-001", "BT24-034", "BT26-009", "BT26-015", "BT26-016"];
const SOURCE_IDS = MATERIALS.map((_, i) => fixtureInstanceId(`feedback79-material-${i}`));
const OMNI = fixturePermanentId("dev-perm-1-feedback79-omni");

for (const mode of ["accept", "decline", "ordinary"] as const) {
  test(`Feedback #79: ${mode} distinguishes battle prevention from Execute's separate deletion`, async ({
    scenario,
    page,
  }) => {
    const ordinary = mode === "ordinary";
    await page.setViewportSize({ width: mode === "accept" ? 390 : 1440, height: mode === "accept" ? 844 : 1000 });
    await page.addInitScript((dark) => localStorage.setItem("aegis:darkMode", String(dark)), mode !== "decline");
    await scenario.openFixture(
      fixtureVariant(preparedFixtures, ordinary ? "ordinary-replacement" : "execute-replacement"),
    );
    await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
    const before = await scenario.snapshot();
    if (process.env.AEGIS_E2E_PRODUCTION === "true") {
      await expect(page.locator("style[data-vite-dev-id]")).toHaveCount(0);
      expect(await page.locator('link[rel="stylesheet"][href*="/assets/"]').count()).toBeGreaterThan(0);
    }
    let holyOffers = 0;
    let preventionOffers = 0;
    let deckAdditionOffers = 0;
    const policy: DecisionPolicy = (decision) => {
      if (decision.kind === "optional") {
        if (decision.sourceCardId === "BT26-015") deckAdditionOffers++;
        const prevention = decision.promptText === "Prevent leaving the battle area?";
        if (prevention && decision.sourceCardId === "BT26-085") preventionOffers++;
        if (prevention && decision.sourceCardId === "BT26-016") {
          holyOffers++;
          expect(decision.sourceInstanceId).toBe(fixtureInstanceId("feedback79-material-4"));
          return { accept: mode === "accept", decisionBudgetMs: 8_000 };
        }
        return { accept: decision.sourceCardId === "BT26-078" || decision.sourceCardId === "BT26-085" };
      }
      if (decision.kind === "selectCards" || decision.kind === "chooseTargets") {
        const candidates = decision.options.candidateInstanceIds ?? [];
        if ((decision.options.min ?? 1) === 0) return { accept: false };
        for (const id of ["player", fixtureInstanceId("feedback79-destroy"), OMNI])
          if (candidates.includes(id)) return { instanceId: id };
      }
      return {};
    };
    if (ordinary) await scenario.attack(fixturePermanentId("dev-perm-0-feedback79-giant"));
    else {
      await scenario.play("Giant Slayer", "Digimon");
      const panel = page.getByRole("dialog", { name: "＜Assembly＞ Giant Slayer", exact: true });
      for (const cardId of [...MATERIALS].reverse())
        await panel
          .locator(".material-prompt__body")
          .getByRole("button")
          .filter({ has: page.locator(`img[src*="${cardId}"]`) })
          .click();
      await panel.getByRole("button", { name: "Assembly (5 cards)", exact: true }).click();
    }
    await scenario.resolveUntil((s) => s.combatWindow?.kind === "barrier", policy);
    const barrier = page.getByRole("dialog", { name: "＜Barrier＞", exact: true });
    await expect(barrier).toBeVisible();
    await barrier.getByRole("button", { name: "Don't use", exact: true }).click();
    await scenario.resolveUntil(
      (s) =>
        preventionOffers === 1 &&
        holyOffers === (ordinary ? 0 : 1) &&
        !s.pendingDecision &&
        !s.combatWindow &&
        (ordinary
          ? deckAdditionOffers === 1 && s.turnSeat === 0 && s.phase === "Main" && s.memory === 3
          : s.turnSeat === 1 && s.phase === "Breeding" && s.memory === 5),
      policy,
    );
    await expect
      .poll(async () => (await scenario.presentation()).events.filter((e) => e.kind === "attackEnded").length)
      .toBe(1);
    await scenario.idle();
    const after = await scenario.snapshot();
    const survivor = after.players[0]!.battleArea.find(
      (p) => p.topCard.instanceId === fixtureInstanceId("feedback79-destroy"),
    );
    expect(after.players[0]!.battleArea).toHaveLength(mode === "decline" ? 0 : 1);
    expect(after.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["AD1-004"]);
    if (mode !== "decline") {
      expect(survivor!.stack.map((c) => c.instanceId)).toEqual([...SOURCE_IDS, fixtureInstanceId("feedback79-giant")]);
      if (ordinary) expect(survivor!.permanentId).toBe(fixturePermanentId("dev-perm-0-feedback79-giant"));
    }
    expect(after.players[0]!.trash.map((c) => c.instanceId)).toEqual(
      mode === "decline"
        ? [...SOURCE_IDS, fixtureInstanceId("feedback79-giant"), fixtureInstanceId("feedback79-destroy")]
        : [],
    );
    expect(after.players[0]!.securityCount).toBe(mode === "accept" ? 2 : 3);
    expect(after.players[0]!.deckCount).toBe(
      before.players[0]!.deckCount + (mode === "accept" ? 0 : ordinary ? -2 : -1),
    );
    expect(after.players[0]!.hand.map((c) => c.instanceId)).toEqual([
      ...before.players[0]!.hand.filter((c) => ordinary || c.instanceId !== fixtureInstanceId("feedback79-giant")).map(
        (c) => c.instanceId,
      ),
      fixtureInstanceId("feedback79-deck-0-1"),
      fixtureInstanceId("feedback79-deck-0-2"),
    ]);
    const events = (await scenario.presentation()).events;
    const evolved = events.filter((e) => e.kind === "digivolved" && e.cardId === "BT26-060");
    expect(evolved).toHaveLength(1);
    if (survivor) expect(evolved[0]).toMatchObject({ permanentId: survivor.permanentId });
    expect(events.filter((e) => e.kind === "attackDeclared")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "securityChecked")).toHaveLength(0);
    expect(
      events.filter((e) => e.kind === "effectTriggered" && e.sourceCardId === "BT26-060" && e.timing === "OnEndAttack"),
    ).toHaveLength(ordinary ? 0 : 1);
    expect(
      events.filter(
        (e) => e.kind === "effectTriggered" && e.sourceCardId === "AD1-025" && e.timing === "whenLeavesPlay",
      ),
    ).toHaveLength(0);
    expect(
      events.filter(
        (e) => e.kind === "cardsMoved" && e.instanceIds.includes(fixtureInstanceId("feedback79-security-0-0")),
      ),
    ).toEqual(
      mode === "accept"
        ? [
            expect.objectContaining({
              to: "deckBottom",
              instanceIds: [fixtureInstanceId("feedback79-security-0-0")],
            }),
          ]
        : [],
    );
    expect(
      events.flatMap((e) => (e.kind === "memoryChanged" && e.reason === "payCost" ? [[e.from, e.to]] : [])),
    ).toEqual(ordinary ? [] : [[2, -5]]);
    if (!ordinary) {
      const prevention = events.findIndex(
        (e) => e.kind === "effectResolved" && e.sourceCardId === "BT26-085" && e.timing === "AllTurns",
      );
      const execute = events.findIndex(
        (e) => e.kind === "effectTriggered" && e.sourceCardId === "BT26-060" && e.timing === "OnEndAttack",
      );
      const ended = events.findIndex((e) => e.kind === "attackEnded");
      for (const index of [prevention, execute, ended]) expect(index).toBeGreaterThanOrEqual(0);
      expect(prevention).toBeLessThan(execute);
      expect(execute).toBeLessThan(ended);
    }
    await scenario.healthy();
  });
}
