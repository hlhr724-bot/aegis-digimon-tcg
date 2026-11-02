// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { hatchDigiEgg, endTurnStep } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import { Client, type Room } from "@colyseus/sdk";
import type { GameState } from "@aegis/shared";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

/**
 * Proves historical migration ledger behavioral scenario "use-option":
 * playing BT1-090 "Gravity Crush" (Red Option, playCost 0; already in RED_DECK, no
 * deck rigging needed) resolves its printed "[Main] Gain 2 memory. At end of turn,
 * lose 2 memory." immediately — an Option's [Main] effect runs automatically as
 * part of playing it (no separate activateEffect click, unlike a permanent's [Main]
 * ability; contrast activateMain.scenario.test.tsx) — and the memory gauge reflects
 * the gain right on the protagonist's rendered DOM
 *.
 */
scenario("use-option", () => {
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

  it("playing Gravity Crush resolves its gain-2-memory effect immediately", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    // Seed 284: seat 0 (protagonist, unmodified RED_DECK) goes first and its dealt
    // opening hand includes BT1-090 "Gravity Crush" — found by exhaustively
    // searching seeds, mirroring mulligan.scenario.test.tsx's seed-4 search.
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: RED_DECK.mainDeck, eggDeck: RED_DECK.eggDeck },
      seed: 284,
    };

    let joinCallCount = 0;
    let protagonistRoom: Room<GameState> | undefined;
    const originalJoinOrCreate = Client.prototype.joinOrCreate;
    vi.spyOn(Client.prototype, "joinOrCreate").mockImplementation(async function (
      this: Client,
      ...args: Parameters<Client["joinOrCreate"]>
    ) {
      const callIndex = joinCallCount++;
      const room = await originalJoinOrCreate.apply(this, args);
      if (callIndex === 0) protagonistRoom = room as Room<GameState>;
      return room;
    });

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

    // §4-21-2: playing an Option needs a Digimon or Tamer of its own color already
    // on the field. A Digi-Egg card alone is not a Digimon, so hatch and then
    // digivolve a Red Lv.3 in breeding. This keeps the battle area empty while
    // satisfying Gravity Crush's color requirement correctly.
    await hatchDigiEgg();
    await screen.findByRole("img", { name: /yokomon|bebydomon/i }, { timeout: 10_000 });

    const yourBreedingSlot = () => document.querySelector('[data-drop="breeding-you"]') as HTMLElement;
    const [rookieImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /monodramon|biyomon/i });
    tap(rookieImg!);
    fireEvent.click(yourBreedingSlot());
    const confirmation = await screen.findByRole("dialog", { name: "Confirm action" });
    fireEvent.click(within(confirmation).getByRole("button", { name: /^digivolve$/i }));
    await vi.waitFor(
      () => expect(within(yourBreedingSlot()).getByRole("img", { name: /monodramon|biyomon/i })).toBeTruthy(),
      { timeout: 10_000 },
    );

    // Select Gravity Crush in hand with a tap and play it via the action bar. An
    // Option is labelled "Play card" (not "Play Digimon") on the action bar
    // (GameScreen.tsx's ActionBar: `Play {isOption ? "card" : "Digimon"}`).
    const gravityCrushImages = within(screen.getByTestId("hand")).getAllByRole("img", { name: /gravity crush/i });
    const gravityCrushInstances = [...protagonistRoom!.state.players[0]!.hand].filter(
      (card) => card.cardId === "BT1-090",
    );
    expect(gravityCrushInstances).toHaveLength(gravityCrushImages.length);
    const gravityCrushInstanceId = gravityCrushInstances[0]!.instanceId;
    const handCountBeforeOption = opponent.room.state.players[0]!.handCount;
    const deckCountBeforeOption = opponent.room.state.players[0]!.deckCount;
    const trashBeforeOption = [...opponent.room.state.players[0]!.trash].map((card) => card.instanceId);
    const memoryBeforeOption = opponent.room.state.memory;
    const [gravityCrushImg] = gravityCrushImages;
    tap(gravityCrushImg!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));

    // Gravity Crush has playCost 0, so the memory gauge shows only its own
    // gained +2 (no cost to offset it) — proving the [Main] effect resolved
    // automatically as part of playing the card, with no further UI interaction.
    await screen.findByText(/memory \+2/i, {}, { timeout: 10_000 });

    // The Option is a one-shot: it leaves the hand and goes to the trash (it
    // never occupies a battle-area slot), which is itself observable — the
    // battle area stays empty on both sides.
    expect(screen.getAllByText(/no digimon in play/i)).toHaveLength(2);
    expect(within(screen.getByTestId("hand")).queryByRole("img", { name: /gravity crush/i })).toBeNull();

    await vi.waitFor(
      () => {
        const player = opponent.room.state.players[0]!;
        expect(opponent.room.state.memory).toBe(memoryBeforeOption + 2);
        expect(player.handCount).toBe(handCountBeforeOption - 1);
        expect(player.deckCount).toBe(deckCountBeforeOption);
        expect(player.trash.filter((card) => !trashBeforeOption.includes(card.instanceId))).toEqual([
          expect.objectContaining({ instanceId: gravityCrushInstanceId, cardId: "BT1-090" }),
        ]);
      },
      { timeout: 10_000 },
    );
    // The card reaches the pile as its Option dock closes, not while it is still docked.
    await vi.waitFor(
      () =>
        expect(screen.getByRole("list", { name: /^you$/i }).textContent).toContain(
          `Trash: ${opponent.room.state.players[0]!.trash.length} discarded`,
        ),
      { timeout: 10_000 },
    );

    // Gravity Crush's end-of-turn loss is pending processing: pass through the real
    // UI so its exact -2 resolves at OnEndTurn before the turn frame flips.
    await endTurnStep(10_000);
    await vi.waitFor(
      () => {
        expect(opponent.room.state.turnSeat).toBe(1);
        expect(opponent.room.state.memory).toBe(5); // +3 pass-turn memory, plus the pending 2-memory loss
      },
      { timeout: 10_000 },
    );
    await screen.findByText(/memory -5/i, {}, { timeout: 10_000 });

    await opponent.leave();
  }, 20_000);
});
