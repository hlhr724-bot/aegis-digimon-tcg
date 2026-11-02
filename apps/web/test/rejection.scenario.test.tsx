// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep } from "./scenarioHarness/breedingStep";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

/**
 * Proves historical migration ledger behavioral scenario "rejection":
 * an action the server projects as unavailable is not offered by the real UI. The
 * selected card still shows its friendly memory cost, so the player can understand
 * why there is no play action without seeing a raw rejection code.
 */
scenario("rejection", () => {
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

  it("an unaffordable card shows its cost without offering an invalid play action", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    // Seed 6 gives seat 0 BT1-025 WarGreymon (play cost 12). At memory 0 the
    // server projection correctly marks it unavailable because the gauge bottoms
    // out at -10.
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: RED_DECK.mainDeck, eggDeck: RED_DECK.eggDeck },
      seed: 6,
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

    // Turn 1 (protagonist, first): skip breeding to reach the Main phase.
    await endBreedingStep();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });

    // Select WarGreymon. The contextual action area stays useful: it names the
    // card and displays the cost, but does not show an action the server would reject.
    const [warGreymonImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^wargreymon$/i });
    fireEvent.pointerDown(warGreymonImg!, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
    expect(await screen.findByText(/costs 12 memory/i, {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /play (digimon|tamer|option)/i })).toBeNull();
    expect(screen.queryByText(/insufficient-memory/i)).toBeNull();
    expect(within(screen.getByTestId("hand")).getAllByRole("img", { name: /^wargreymon$/i })).toHaveLength(1);
    expect(opponent.room.state.memory).toBe(0);

    await opponent.leave();
  }, 20_000);
});
