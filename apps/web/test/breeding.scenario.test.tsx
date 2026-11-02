// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { hatchDigiEgg, moveFromBreedingArea, waitForBoardActions, endTurnStep } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

const MOTHER_D_REAPER_DECK = {
  mainDeck: RED_DECK.mainDeck,
  // Four copies are legal and make the deterministic hatch independent of the
  // egg-deck shuffle. EX2-007 is a Digi-Egg despite having 15000 printed DP.
  eggDeck: ["EX2-007", "EX2-007", "EX2-007", "EX2-007"],
};

/**
 * Proves historical migration ledger behavioral scenario "breeding":
 * hatching a Digi-Egg and, once the raised Digimon has DP (Comprehensive Rules
 * §4-16-2), moving it from the breeding area to the battle area through the real UI
 *.
 */
scenario("breeding", () => {
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

  it("hatching and moving a Digimon from breeding renders it in the battle area", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    // Seed 4: seat 0 (protagonist, RED_DECK) goes first. Its dealt hand contains
    // a Biyomon (BT1-012, Lv.3 Red) whose digivolution requirement — color Red,
    // level 2, memory cost 0 — is met for free by either RED_EGGS hatchling
    // (Yokomon/Bebydomon, both Lv.2 Red), so the raised Digimon can reach level 3
    // (the battle-area threshold) in the same turn it hatches.
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: RED_DECK.mainDeck, eggDeck: RED_DECK.eggDeck },
      seed: 4,
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

    // The first player's breeding step opens automatically (the egg deck is
    // non-empty), and the egg deck itself is the hatch action.
    await hatchDigiEgg();

    // "Hatch a Digi-Egg" is the turn player's one breeding action (Comprehensive
    // Rules §6-4-1), so it closes the breeding window itself — no separate "End
    // phase" click is needed to reach Main. The protagonist's own breeding slot is
    // the only one carrying `data-drop="breeding-you"` (the real drag-and-drop
    // target attribute); the opponent's mirror slot has no such attribute, and both
    // slots otherwise share the same "raising" label, so this is the only reliable
    // way to scope to the protagonist's own slot.
    const yourBreedingSlot = () => document.querySelector('[data-drop="breeding-you"]') as HTMLElement;
    await vi.waitFor(
      () => expect(within(yourBreedingSlot()).getByRole("img", { name: /yokomon|bebydomon/i })).toBeTruthy(),
      { timeout: 10_000 },
    );

    // Select a "Biyomon" in hand and digivolve the raised Lv.2 Digimon in the
    // breeding area with it (free — memory cost 0) by clicking the breeding slot,
    // the same click-routing the battle area uses for on-field digivolution.
    const [biyomonImg] = await screen.findAllByRole("img", { name: /biyomon/i });
    await waitForBoardActions();
    tap(biyomonImg!);
    fireEvent.click(yourBreedingSlot());
    const confirmation = await screen.findByRole("dialog", { name: "Confirm action" });
    fireEvent.click(within(confirmation).getByRole("button", { name: /^digivolve$/i }));

    await vi.waitFor(() => expect(within(yourBreedingSlot()).getByRole("img", { name: /^biyomon$/i })).toBeTruthy(), {
      timeout: 10_000,
    });

    // End the Main phase to pass the turn; drive the headless opponent's own
    // Breeding/Main phases with the same `endPhase` intent the real UI sends,
    // fired on every incoming state patch during its turn (both windows are safe
    // to over-skip — a redundant `endPhase` on an already-closed window is
    // rejected server-side as a no-op).
    opponent.room.onStateChange((state) => {
      if (state.turnSeat === 1 && (state.phase === "Breeding" || state.phase === "Main")) {
        opponent.endPhase();
      }
    });
    await waitForBoardActions();
    await endTurnStep();

    // Back on the protagonist's second turn, the breeding step reopens — the
    // raising slot now moves out instead of hatching, since the raised Biyomon is
    // already level 3.
    await moveFromBreedingArea();

    // The Biyomon now renders in the battle area and the breeding slot is empty.
    await screen.findAllByRole("img", { name: /biyomon/i }, { timeout: 10_000 });
    await vi.waitFor(() => expect(within(yourBreedingSlot()).queryByRole("img")).toBeNull(), { timeout: 10_000 });
    expect(within(yourBreedingSlot()).getByText(/empty/i)).toBeTruthy();

    await opponent.leave();
  }, 40_000);

  it("offers Mother D-Reaper's official DP-based move and renders it in battle", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "D-Reaper Player",
      deck: MOTHER_D_REAPER_DECK,
      seed: 4,
    };

    render(<GameScreen joinOptions={joinOptions} identityColor="White" startMode="casual" onExit={() => {}} />);
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
    await hatchDigiEgg();

    const yourBreedingSlot = () => document.querySelector('[data-drop="breeding-you"]') as HTMLElement;
    await vi.waitFor(
      () => expect(within(yourBreedingSlot()).getByRole("img", { name: /mother d-reaper/i })).toBeTruthy(),
      { timeout: 10_000 },
    );

    opponent.room.onStateChange((state) => {
      if (state.turnSeat === 1 && (state.phase === "Breeding" || state.phase === "Main")) {
        opponent.endPhase();
      }
    });
    await waitForBoardActions();
    await endTurnStep();

    await moveFromBreedingArea();

    await vi.waitFor(() => expect(within(yourBreedingSlot()).queryByRole("img")).toBeNull(), { timeout: 10_000 });
    expect(screen.getByRole("img", { name: /mother d-reaper/i })).toBeTruthy();
    expect(opponent.room.state.players[0]!.battleArea[0]?.topCard.cardId).toBe("EX2-007");

    await opponent.leave();
  }, 40_000);
});
