// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { BLUE_DECK, RED_DECK } from "@aegis-api/engine/testDecks.js";
import type { AegisJoinOptions } from "../src/net/types";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep } from "./scenarioHarness/breedingStep";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import { dragOnto } from "./scenarioHarness/dragDrop";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";
import { resolveIncidentalDecisionsThroughUi, respondToHeadlessDecision } from "./scenarioHarness/decisions";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { tap } from "./scenarioHarness/tap";

// Seed 14 deals the BT1-011 and BT1-014 slots into the opening hand.
// P-122's security search has no multicolor candidate in this legal deck.
const PROMO_DECK = swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-014", "BT1-051"), "BT1-011", "P-122");

scenario("promo-p122-evolution-stack", () => {
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

  it("evolves P-122 Patamon through the rendered UI and preserves its inherited source in the stack", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Promo auditor",
      deck: PROMO_DECK,
      seed: 14,
    };
    render(<GameScreen joinOptions={joinOptions} identityColor="Yellow" startMode="casual" onExit={() => {}} />);
    await screen.findByText(/finding an opponent/i);
    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Headless Opponent",
      deck: BLUE_DECK,
    });
    opponent.onDecision((request) => {
      if (request.kind === "mulligan") opponent.mulligan(true);
      else respondToHeadlessDecision(opponent, request);
    });
    opponent.room.onStateChange((state) => {
      if (state.turnSeat !== 1 || state.pendingDecision) return;
      if (state.phase === "Breeding" || state.phase === "Main") opponent.endPhase();
    });
    opponent.ready();
    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    await endBreedingStep();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"));
    tap(within(screen.getByTestId("hand")).getAllByRole("img", { name: /^patamon$/i })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /play digimon/i }));
    await vi.waitFor(() => expect(opponent.room.state.pendingDecision?.kind).toBe("optional"));
    await resolveIncidentalDecisionsThroughUi(opponent);

    await endBreedingStep();
    await vi.waitFor(() => {
      expect(opponent.room.state.turnSeat).toBe(0);
      expect(opponent.room.state.phase).toBe("Main");
    });
    const battleArea = document.querySelector('[data-drop="battle-you"]') as HTMLElement;
    const patamon = within(battleArea)
      .getByRole("img", { name: /^patamon$/i })
      .closest('[data-drop="perm-you"]');
    dragOnto(
      within(screen.getByTestId("hand")).getAllByRole("img", { name: /^reppamon$/i })[0]!,
      patamon as HTMLElement,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^digivolve$/i }));

    await screen.findByText(/memory \+1/i, {}, { timeout: 10_000 });
    expect(within(battleArea).queryByRole("img", { name: /^patamon$/i })).toBeNull();
    const reppamon = within(battleArea)
      .getByRole("img", { name: /^reppamon$/i })
      .closest('[data-drop="perm-you"]');
    tap(reppamon as HTMLElement);
    expect(
      within(await screen.findByRole("group", { name: /^\d+ sources?$/i })).getByRole("button", { name: /^patamon$/i }),
    ).toBeTruthy();
    expect(screen.getByText(/4,000 DP/i)).toBeTruthy();
    await opponent.leave();
  }, 60_000);
});
