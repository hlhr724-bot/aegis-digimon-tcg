// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

// BT11-009 "Shoutmon + StarSword" (Red/Yellow, Lv.3, playCost 5) carries a DigiXros
// requirement: "DigiXros -1: [Shoutmon] x∞" — one material slot named "Shoutmon",
// each placed material reducing the play cost by 1
// (packages/shared/src/effects/effects.json's `digiXrosRequirement`, compiled from
// the printed text). BT5-009 "Shoutmon" (Red, Lv.3) is a plain, on-play-effect-free*
// material source. (*Its own [On Play] never fires here — a DigiXros material is
// placed, not played.) Swapped 1:1 for RED_DECK's BT1-020 (Groundramon, count 4) and
// BT1-021 (MetalGreymon, count 4) so the deck stays legal and both swaps land in the
// array slots their originals held under the shuffle.
const PROTAGONIST_DECK = swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-020", "BT11-009"), "BT1-021", "BT5-009");

/**
 * Proves historical migration ledger behavioral scenario "digi-xros":
 * playing a DigiXros card, placing a named material card from hand under it through
 * the real UI, renders the DigiXros Digimon in the battle area (with the material
 * stacked underneath it, not merely discarded) and the memory gauge reflects the
 * reduced cost.
 *
 * Engine/UI gap (reported, not faked): a full "with expanders" proof would additionally
 * exercise an expander Tamer (BT19-079/BT19-087/EX4-062 — packages/shared/src/cards/
 * zoneExpanders.ts) suspending itself to unlock the trash/under-Tamer material
 * sources. That requires a material card already sitting UNDER a Tamer before the
 * DigiXros play — reachable only via a prior digivolve-onto-Tamer or placeUnder
 * effect, which would need its own multi-turn setup and a second, unrelated card
 * chain. This scenario proves the reachable core (materials selected through the UI,
 * a real cost reduction, the card entering play with materials stacked beneath it);
 * the expander-suspend path is left unproven rather than staged with an unreachable
 * board state.
 */
scenario("digi-xros", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterEach(() => cleanup());

  afterAll(async () => {
    cleanup();
    await server.close();
    vi.unstubAllEnvs();
  });

  it("playing Shoutmon + StarSword with a Shoutmon material renders it in the battle area with the material in its stack", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    // Seed 94: seat 0 (protagonist, the swapped deck) goes first and its dealt
    // opening hand includes two copies of BT11-009 "Shoutmon + StarSword" and one
    // BT5-009 "Shoutmon" — found by exhaustively searching seeds, mirroring
    // mulligan.scenario.test.tsx's seed-4 search.
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: PROTAGONIST_DECK.mainDeck, eggDeck: PROTAGONIST_DECK.eggDeck },
      seed: 94,
    };

    render(<GameScreen joinOptions={joinOptions} identityColor="Red" startMode="casual" onExit={() => {}} />);

    await screen.findByText(/finding an opponent/i);

    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Headless Opponent",
      deck: { mainDeck: BLUE_DECK.mainDeck, eggDeck: BLUE_DECK.eggDeck },
    });
    opponent.onDecision((req) => {
      if (req.kind === "mulligan") opponent.mulligan(true);
    });
    opponent.ready();

    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    const yourBattleArea = () => document.querySelector('[data-drop="battle-you"]') as HTMLElement;

    // Skip breeding to reach the Main phase.
    await endBreedingStep();
    const handCountBefore = opponent.room.state.players[0]!.handCount;
    const memoryBefore = opponent.room.state.memory;
    const battleAreaCountBefore = opponent.room.state.players[0]!.battleArea.length;

    // Select "Shoutmon + StarSword" in hand (a tap) and click "Play Digimon". Unlike
    // a normal play, GameScreen.tsx's `playCard` checks `digiXrosRequirementFor`
    // first for any DigiXros-eligible card and opens the DigiXrosMaterialOverlay
    // instead of sending the intent immediately.
    const [xrosCardImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^shoutmon \+ starsword$/i });
    tap(xrosCardImg!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));

    // The overlay lists the Shoutmon material candidate (from hand); select it and
    // confirm — DigiXros -1 reduces the printed cost (5) by 1 per material placed.
    // The board's own (background) hand still renders its own "Shoutmon" card image
    // too (not yet consumed), so scope to the candidate OUTSIDE the hand container.
    await screen.findByText(/place material cards under it/i, {}, { timeout: 10_000 });
    const handEl = screen.getByTestId("hand");
    const materialImg = (await screen.findAllByRole("img", { name: /^shoutmon$/i }, { timeout: 10_000 })).find(
      (img) => !handEl.contains(img),
    )!;
    fireEvent.click(materialImg);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    // Cancelling a selected recipe must send no play intent to the room.
    expect(screen.queryByText(/place material cards under it/i)).toBeNull();
    expect(opponent.room.state.memory).toBe(memoryBefore);
    expect(opponent.room.state.players[0]!.handCount).toBe(handCountBefore);
    expect(opponent.room.state.players[0]!.battleArea).toHaveLength(battleAreaCountBefore);
    expect(within(screen.getByTestId("hand")).getByRole("img", { name: /^shoutmon$/i })).toBeTruthy();

    tap(within(screen.getByTestId("hand")).getAllByRole("img", { name: /^shoutmon \+ starsword$/i })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await screen.findByText(/place material cards under it/i, {}, { timeout: 10_000 });
    const reopenedMaterial = (await screen.findAllByRole("img", { name: /^shoutmon$/i }, { timeout: 10_000 })).find(
      (img) => !screen.getByTestId("hand").contains(img),
    )!;
    fireEvent.click(reopenedMaterial);
    fireEvent.click(await screen.findByRole("button", { name: /digixros \(1 card\)/i }, { timeout: 10_000 }));

    // Shoutmon + StarSword now renders in the battle area and the memory gauge
    // reflects the reduced cost: 0 - (5 - 1) = -4.
    await screen.findByText(/memory -4/i, {}, { timeout: 10_000 });
    expect(
      await within(yourBattleArea()).findAllByRole("img", { name: /^shoutmon \+ starsword$/i }, { timeout: 10_000 }),
    ).toHaveLength(1);

    // The material left the hand (it was consumed as a DigiXros material, not
    // discarded loose) — the plain "Shoutmon" card is gone from hand, and the
    // battle area shows only the DigiXros result, not a separate Shoutmon permanent.
    // The hand is held at its pre-play figure while the ribbons of the turn play out,
    // so this waits the same budget as the other checkpoints above.
    await vi.waitFor(
      () => {
        expect(within(screen.getByTestId("hand")).queryByRole("img", { name: /^shoutmon$/i })).toBeNull();
      },
      { timeout: 10_000 },
    );
    expect(within(yourBattleArea()).queryByRole("img", { name: /^shoutmon$/i })).toBeNull();

    // Prove the material was actually STACKED under the DigiXros card (not merely
    // discarded): the permanent's public stack-count badge renders one
    // digivolution card beneath its visible top card.
    const xrosPermEl = within(yourBattleArea())
      .getByRole("img", { name: /^shoutmon \+ starsword$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    expect(within(xrosPermEl).getByText(/^×1$/i)).toBeTruthy();

    // The opposing client receives the real room projection. Check the exact card
    // identities and bottom-to-top source order behind the badge and memory label.
    await vi.waitFor(
      () => {
        const player = opponent.room.state.players[0]!;
        const played = player.battleArea.find((permanent) => permanent.topCard?.cardId === "BT11-009");
        expect(played).toBeDefined();
        expect(played!.topCard.instanceId).toBeTruthy();
        expect(played!.stack.map(({ cardId }) => cardId)).toEqual(["BT5-009"]);
        expect(played!.stack[0]!.instanceId).not.toBe(played!.topCard.instanceId);
        expect(player.trash.map(({ cardId }) => cardId)).not.toContain("BT5-009");
        expect(player.handCount).toBe(handCountBefore - 2);
        // The room gauge is reframed for seat 1 when the paid cost ends our turn.
        expect(opponent.room.state.memory).toBe(4);
      },
      { timeout: 10_000 },
    );

    tap(xrosPermEl);
    expect(
      within(await screen.findByRole("group", { name: /^\d+ sources?$/i })).getByRole("button", {
        name: /^shoutmon$/i,
      }),
    ).toBeTruthy();

    await opponent.leave();
  }, 20_000);
});
