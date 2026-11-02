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
import { dragOnto } from "./scenarioHarness/dragDrop";

const PROTAGONIST_DECK = swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-017", "EX10-007"), "BT1-011", "EX10-006");

scenario("ex10-evolution-stack", () => {
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

  it("EX10 Agumon evolves into Greymon for 2 memory and supplies its inherited DP", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: PROTAGONIST_DECK.mainDeck, eggDeck: PROTAGONIST_DECK.eggDeck },
      seed: 44,
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
    opponent.room.onStateChange((state) => {
      if (state.turnSeat !== 1 || state.pendingDecision) return;
      if (state.phase === "Breeding" || state.phase === "Main") opponent.endPhase();
    });
    opponent.ready();

    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    const yourBattleArea = () => document.querySelector('[data-drop="battle-you"]') as HTMLElement;

    await endBreedingStep();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });

    const [agumonImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^agumon$/i });
    tap(agumonImg!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));

    await vi.waitFor(
      () => expect(within(yourBattleArea()).getAllByRole("img", { name: /^agumon$/i })).toHaveLength(1),
      { timeout: 10_000 },
    );

    await endBreedingStep();
    await vi.waitFor(
      () => {
        expect(opponent.room.state.turnSeat).toBe(0);
        expect(opponent.room.state.phase).toBe("Main");
      },
      { timeout: 10_000 },
    );

    const agumonPermEl = within(yourBattleArea())
      .getByRole("img", { name: /^agumon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    const [greymonImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^greymon$/i });
    dragOnto(greymonImg!, agumonPermEl);

    const alternateOption = await screen.findByRole("button", { name: /agumon.*2 memory/i }, { timeout: 10_000 });
    expect(screen.getByRole("button", { name: /red lv\.3.*3 memory/i })).toBeTruthy();
    fireEvent.click(alternateOption);

    await screen.findByText(/memory \+1/i, {}, { timeout: 10_000 });
    expect(within(yourBattleArea()).getAllByRole("img", { name: /^greymon$/i })).toHaveLength(1);
    expect(within(yourBattleArea()).queryAllByRole("img", { name: /^agumon$/i })).toHaveLength(0);

    await vi.waitFor(
      () => {
        const evolved = opponent.room.state.players[0]!.battleArea.find(
          (permanent) => permanent.topCard?.cardId === "EX10-007",
        );
        expect(evolved).toBeDefined();
        expect(evolved!.stack.map((card) => card.cardId)).toContain("EX10-006");
        // Printed 4000, inherited Agumon +1000, Greymon evolution effect +3000.
        expect(evolved!.currentDP).toBe(8000);
        expect(opponent.room.state.pendingDecision).toBeUndefined();
      },
      { timeout: 10_000 },
    );
    await opponent.leave();
  }, 60_000);
});
