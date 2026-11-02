// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep, waitForBoardActions } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

scenario("alternate-arts", () => {
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

  it("synchronizes mixed printings of the same card from join options and keeps the played copy's art", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");
    // Seed 30 deals two copies of the Biyomon slots. Swap those slots with Monodramon,
    // keeping the deck legal while mixing original and alternate Monodramon printings.
    const mainDeck = RED_DECK.mainDeck.map((cardId) =>
      cardId === "BT1-012" ? "BT1-009" : cardId === "BT1-009" ? "BT1-012" : cardId,
    );
    let monodramonCopy = 0;
    const printings = ["BT1-009", "BT1-009_P1", "BT1-009", "BT1-009_P1"];
    const mainDeckArts = mainDeck.map((cardId) => (cardId === "BT1-009" ? printings[monodramonCopy++]! : cardId));
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Arts Protagonist",
      deck: { mainDeck, eggDeck: [...RED_DECK.eggDeck], mainDeckArts },
      seed: 30,
    };
    render(<GameScreen joinOptions={joinOptions} identityColor="Red" startMode="casual" onExit={() => {}} />);
    await screen.findByText(/finding an opponent/i);
    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Opponent",
      deck: { mainDeck: BLUE_DECK.mainDeck, eggDeck: BLUE_DECK.eggDeck },
    });
    try {
      opponent.onDecision((request) => {
        if (request.kind === "mulligan") opponent.mulligan(true);
      });
      opponent.ready();
      fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));
      await endBreedingStep();
      await screen.findAllByText(/no digimon in play/i, {}, { timeout: 10_000 });
      await screen.findByRole("button", { name: /^end turn$/i }, { timeout: 10_000 });
      await waitForBoardActions();
      const images = within(screen.getByTestId("hand")).getAllByRole("img", {
        name: /^monodramon$/i,
      }) as HTMLImageElement[];
      expect(images).toHaveLength(2);
      expect(new Set(images.map((image) => image.getAttribute("src"))).size).toBe(2);
      const selected = images.find((image) => image.getAttribute("src")?.includes("BT1-009_P"))!;
      expect(selected).toBeDefined();
      const selectedSource = selected.getAttribute("src");
      tap(selected);
      const playButton = (await screen.findByRole("button", {
        name: /play (digimon|tamer|option)/i,
      })) as HTMLButtonElement;
      await vi.waitFor(() => expect(playButton.disabled).toBe(false));
      fireEvent.click(playButton);
      await vi.waitFor(
        () => {
          const permanent = document.querySelector('[data-drop="perm-you"]') as HTMLElement;
          expect(permanent).toBeTruthy();
          expect(
            within(permanent)
              .getByRole("img", { name: /^monodramon$/i })
              .getAttribute("src"),
          ).toBe(selectedSource);
        },
        { timeout: 10_000 },
      );
      await vi.waitFor(
        () => expect(within(screen.getByTestId("hand")).getAllByRole("img", { name: /^monodramon$/i })).toHaveLength(1),
        { timeout: 10_000 },
      );
    } finally {
      await opponent.leave();
    }
  }, 20_000);
});
