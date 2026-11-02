// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { BLUE_DECK, RED_DECK } from "@aegis-api/engine/testDecks.js";
import type { AegisJoinOptions } from "../src/net/types";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep } from "./scenarioHarness/breedingStep";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import { dragOnto } from "./scenarioHarness/dragDrop";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { tap } from "./scenarioHarness/tap";

// Seed 2 deals the BT1-011 and BT1-017 slots into the opening hand. The first
// replacement keeps the deck count legal while moving the BT1-011 slot to a
// vanilla red Lv.3 Agumon, and the second places AD1-001 in the BT1-017 slot.
const AD1_DECK = swapMainDeckCard(
  swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-010", "AD1-010"), "BT1-011", "ST1-03"),
  "BT1-017",
  "AD1-001",
);

scenario("ad1-001-evolution-stack", () => {
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

  it("evolves Agumon into AD1-001 through the rendered UI and shows its inherited source", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "AD1 auditor",
      deck: AD1_DECK,
      seed: 2,
    };

    render(<GameScreen joinOptions={joinOptions} identityColor="Red" startMode="casual" onExit={() => {}} />);
    await screen.findByText(/finding an opponent/i);
    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Headless Opponent",
      deck: BLUE_DECK,
    });
    opponent.onDecision((request) => {
      if (request.kind === "mulligan") opponent.mulligan(true);
    });
    opponent.room.onStateChange((state) => {
      if (state.turnSeat !== 1 || state.pendingDecision) return;
      if (state.phase === "Breeding" || state.phase === "Main") opponent.endPhase();
    });
    opponent.ready();

    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));
    const battleArea = () => document.querySelector('[data-drop="battle-you"]') as HTMLElement;

    await endBreedingStep();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    tap(within(screen.getByTestId("hand")).getAllByRole("img", { name: /^agumon$/i })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /play digimon/i }));
    await vi.waitFor(() => expect(opponent.room.state.players[0]!.battleArea).toHaveLength(1));
    // Playing no longer cancels the phase presentation; wait for the field to catch up.
    await vi.waitFor(() => expect(within(battleArea()).getAllByRole("img", { name: /^agumon$/i })).toHaveLength(1), {
      timeout: 10_000,
    });

    await endBreedingStep();
    await vi.waitFor(() => {
      expect(opponent.room.state.turnSeat).toBe(0);
      expect(opponent.room.state.phase).toBe("Main");
    });

    const agumon = within(battleArea())
      .getByRole("img", { name: /^agumon$/i })
      .closest('[data-drop="perm-you"]');
    const greymon = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^greymon$/i })[0]!;
    dragOnto(greymon, agumon as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: /^digivolve$/i }));
    await vi.waitFor(() => expect(within(battleArea()).getAllByRole("img", { name: /^greymon$/i })).toHaveLength(1), {
      timeout: 10_000,
    });
    // Agumon's play crossed the gauge, then the pass-turn bonus restored 3 memory;
    // AD1-001's printed red Lv.3 evolution cost is 2, so the rendered gauge must land at +1.
    await screen.findByText(/memory \+1/i, {}, { timeout: 10_000 });
    expect(within(battleArea()).queryAllByRole("img", { name: /^agumon$/i })).toHaveLength(0);

    const evolved = within(battleArea())
      .getByRole("img", { name: /^greymon$/i })
      .closest('[data-drop="perm-you"]');
    tap(evolved as HTMLElement);
    expect(
      within(await screen.findByRole("group", { name: /^\d+ sources?$/i })).getByRole("button", { name: /^agumon$/i }),
    ).toBeTruthy();
    await opponent.leave();
  }, 60_000);
});
