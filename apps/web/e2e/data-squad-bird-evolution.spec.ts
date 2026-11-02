import { fileURLToPath } from "node:url";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "../../api/src/engine/scenarios/data-squad-bird-evolution.fixture";
import { test, expect } from "./scenario-page";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`DATA SQUAD birds place, discard, recruit and pay Tamer cards at ${viewport.width}px`, async ({ scenario }) => {
    await scenario.page.setViewportSize(viewport);
    await stubCardArtwork(scenario.page);
    await scenario.page.route(/\/assets\/card-images\/BT27-(074|078|081)(?:-Sample)?\.webp(?:\?.*)?$/, (route) => {
      const cardId = new URL(route.request().url()).pathname.split("/").pop()!.replace("-Sample", "");
      return route.fulfill({
        contentType: "image/webp",
        path: fileURLToPath(new URL(`../../../data/card-images/${cardId}`, import.meta.url)),
      });
    });
    const refs = await scenario.openFixture(fixture, "normal", "none");
    await scenario.resolveUntil(
      (s) => s.phase === "Main" && !s.pendingDecision,
      () => ({ accept: false }),
    );
    const initial = await scenario.snapshot();
    const falcomonArt = scenario.page
      .locator(`[data-drop="perm-you"][data-id="${refs.permanentId("line")}"]`)
      .getByRole("img", { name: "Falcomon", exact: true });
    await expect.poll(() => falcomonArt.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(868);
    const keenanTop = initial.players[0]!.battleArea.find((p) => p.permanentId === refs.permanentId("keenan"))!.topCard
      .instanceId;
    await scenario.play("Falcomon", "Digimon");
    await scenario.resolveUntil(
      (s) => !s.pendingDecision && s.players[0]!.trash.some((c) => c.instanceId === refs.instanceId("discard")),
      (d) => {
        if (d.sourceCardId !== "BT27-074") {
          return { accept: false };
        }
        const candidates = d.options.candidateInstanceIds ?? [];
        if (candidates.includes(keenanTop)) {
          return { instanceId: keenanTop };
        }
        if (candidates.includes(refs.instanceId("placement"))) {
          return { instanceId: refs.instanceId("placement") };
        }
        if (candidates.includes(refs.instanceId("discard"))) {
          return { instanceId: refs.instanceId("discard") };
        }
        return { accept: true };
      },
    );
    const afterPlay = await scenario.snapshot();
    const placed = afterPlay.players[0]!.battleArea.find((p) => p.permanentId === refs.permanentId("keenan"))!.stack;
    expect(placed.map((c) => c.instanceId)).toContain(refs.instanceId("placement"));
    expect(placed.every((c) => !c.faceUp)).toBe(true);
    const peckmon = scenario.page.locator(`[data-hand-instance-id="${refs.instanceId("peckmon")}"]`);
    await peckmon.focus();
    await peckmon.press("Enter");
    await scenario.page.getByRole("button", { name: "Digivolve", exact: true }).click();
    await scenario.page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId("line")}"]`).click();
    await scenario.resolveUntil(
      (s) =>
        !s.pendingDecision &&
        s.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("recruitedKeenan")),
      (d) =>
        d.sourceCardId === "BT27-078"
          ? { instanceId: refs.instanceId("recruitedKeenan"), accept: true }
          : { accept: false },
    );
    const crowmonHighlights: string[] = [];
    await scenario.evolve("Crowmon", refs.permanentId("line"));
    await scenario.resolveUntil(
      (s) =>
        !s.pendingDecision && s.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("reward")),
      async (d) => {
        if (d.sourceCardId !== "BT27-081") {
          return { accept: false };
        }
        if (d.kind !== "orderTriggers") {
          const viewEffect = scenario.page.getByRole("button", { name: "View effect", exact: true });
          if (await viewEffect.isVisible()) {
            await viewEffect.click();
          }
          const emphasis = d.options.effectTextEmphasis;
          expect(emphasis).toBeDefined();
          await expect(scenario.page.locator(".decision-overlay__effect-step")).toHaveText(emphasis!);
          crowmonHighlights.push(emphasis!);
        }
        const candidates = d.options.candidateInstanceIds ?? [];
        if (candidates.includes(keenanTop)) {
          return { instanceId: keenanTop };
        }
        if (candidates.includes(refs.instanceId("reward"))) {
          return { instanceId: refs.instanceId("reward") };
        }
        return { accept: true };
      },
    );
    expect([...new Set(crowmonHighlights)]).toEqual([
      "Then, by trashing 2 bottom face-down cards from under any of your Tamers,",
      "you may play or use 1 [DATA SQUAD] trait card with a play or use cost of 5 or less from your hand without paying the cost.",
    ]);
    const final = await scenario.snapshot();
    expect(final.memory).toBe(initial.memory - 8);
    expect(final.players[1]!.handCount).toBe(5);
    expect(final.players[0]!.trash.map((c) => c.instanceId)).toEqual(
      expect.arrayContaining([
        refs.instanceId("bottomPayment"),
        refs.instanceId("placement"),
        refs.instanceId("discard"),
      ]),
    );
    const line = final.players[0]!.battleArea.find((p) => p.permanentId === refs.permanentId("line"))!;
    expect(line.topCard.cardId).toBe("BT27-081");
    expect(line.stack.map((c) => c.cardId)).toEqual(["BT26-005", "BT27-074", "BT27-078"]);
    await scenario.healthy();
  });
}
