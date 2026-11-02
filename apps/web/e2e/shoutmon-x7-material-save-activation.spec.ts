import fixture from "../../api/src/engine/scenarios/shoutmon-x7-material-save-activation.fixture";
import { test, expect } from "./scenario-page";

for (const accept of [true, false]) {
  test(`Shoutmon X7 explicitly activates or declines Material Save: ${accept}`, async ({ scenario, page }) => {
    const refs = await scenario.openFixture(fixture, "normal", "none");
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    await scenario.attack(refs.permanentId("shoutmon"));
    let offered = false;
    await scenario.resolveUntil(
      (state) =>
        state.players[0]!.trash.some((card) => card.instanceId === refs.instanceId("shoutmon")) &&
        !state.pendingDecision &&
        !state.combatWindow,
      async (decision) => {
        if (decision.options.selectionContext === "materialSaveActivation") {
          offered = true;
          expect(decision.sourceCardId).toBe("BT11-019");
          expect(decision.options.visibleInstanceIds).toHaveLength(4);
          const dialog = page.getByRole("dialog", { name: "Shoutmon X7 · effect", exact: true });
          await expect(dialog.getByRole("button", { name: "Yes, activate", exact: true })).toBeVisible();
          await expect(dialog.getByRole("button", { name: "No, decline", exact: true })).toBeVisible();
          await expect(dialog.getByRole("button", { name: /confirm targets/i })).toHaveCount(0);
          for (const name of ["Starmons", "Ballistamon", "ZeigGreymon", "OmniShoutmon"])
            await expect(dialog.getByRole("img", { name, exact: true })).toBeVisible();
          return { accept };
        }
        return {
          instanceIds: ["starmons", "ballistamon", "zeiggreymon", "omnishoutmon"].map((alias) =>
            refs.instanceId(alias),
          ),
        };
      },
    );
    expect(offered).toBe(true);
    const final = await scenario.snapshot();
    const tamer = final.players[0]!.battleArea.find(
      (permanent) => permanent.permanentId === refs.permanentId("tamer"),
    )!;
    expect(tamer.stack.map((card) => card.cardId).sort()).toEqual(
      accept ? ["BT10-029", "BT19-047", "AD1-013", "BT11-015"].sort() : [],
    );
    await scenario.healthy();
  });
}
