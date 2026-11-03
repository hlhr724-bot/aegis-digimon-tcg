import fixtureMetaletemonRedirectPlayer from "../../api/src/engine/scenarios/metaletemon-redirect-player.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

const SCENARIO = fixtureMetaletemonRedirectPlayer;
const METAL_ETEMON = fixturePermanentId("own-metaletemon");
const ATTACKER = fixturePermanentId("opponent-metaletemon-agumon");
const ATTACKED = fixturePermanentId("own-attacked-digimon");

const isRedirectPrompt = (payloadJson: string | undefined) =>
  (JSON.parse(payloadJson || "{}") as { candidateInstanceIds?: string[] }).candidateInstanceIds?.includes(
    METAL_ETEMON,
  ) === true;

// Discord 1558441146781536346: MetalEtemon (EX5-054) may switch an attack "to this Digimon or
// the player". The player is MetalEtemon's controller (Q3647), but the prompt labelled that
// choice as the opponent's security.
test.describe("MetalEtemon switches an attack to its own player", () => {
  test.use({
    holdBotAfterTurn: 2,
    botMainIntents: [
      [
        {
          type: "attack",
          attackerPermanentId: ATTACKER,
          target: { kind: "permanent", permanentId: ATTACKED },
        },
        { type: "endPhase" },
      ],
      { scope: "test" },
    ],
  });

  test("the redirect prompt offers your own security and the attack checks it", async ({ scenario }) => {
    test.setTimeout(120_000);
    const { page } = scenario;
    await scenario.openFixture(SCENARIO, "normal", "none");
    await scenario.resolveUntil(
      (s) => s.pendingDecision?.seat === 0 && isRedirectPrompt(s.pendingDecision.payloadJson),
      () => ({}),
    );
    const dialog = page.getByRole("dialog");
    const ownSecurity = dialog.locator('[data-instance-id="mine"]');
    await expect(ownSecurity).toBeVisible();
    await expect(ownSecurity).toContainText("Your security");
    await expect(dialog.getByText("Opponent security")).toHaveCount(0);
    await ownSecurity.click();
    await dialog.getByRole("button", { name: /^(Confirm targets|End Selection|Confirm)$/i }).click();

    await scenario.resolveUntil(
      (s) =>
        !s.pendingDecision &&
        !s.combatWindow &&
        !s.players[1]!.battleArea.some((permanent) => permanent.permanentId === ATTACKER),
    );
    const final = await scenario.snapshot();
    expect(final.players[0]!.securityCount).toBe(3);
    expect(final.players[1]!.securityCount).toBe(3);
    expect(final.players[0]!.battleArea.some((permanent) => permanent.permanentId === METAL_ETEMON)).toBe(true);
    const { events } = await scenario.presentation();
    expect(events.find((event) => event.kind === "attackDeclared" && event.redirected === true)).toMatchObject({
      target: { kind: "player" },
    });
    expect(events.find((event) => event.kind === "securityChecked")).toMatchObject({ revealedCardId: "BT11-041" });
    await scenario.healthy();
  });
});
