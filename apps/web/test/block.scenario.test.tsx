// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep } from "./scenarioHarness/breedingStep";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";
import { respondToHeadlessDecision } from "./scenarioHarness/decisions";

/**
 * Proves historical migration ledger behavioral scenario "block":
 * when the opponent attacks the protagonist directly, the protagonist (the
 * defender) can declare a ＜Blocker＞ Digimon through the real UI's block window to
 * redirect the attack onto it instead of their security
 *. The protagonist is the DEFENDER
 * responding to the prompt here; the headless opponent is the attacker.
 */
scenario("block", () => {
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

  it("declaring a Blocker in the block window redirects the attack away from security", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    // Seed 1: seed is odd, so the headless opponent (seat 1, RED_DECK) goes first —
    // apps/api/src/engine/GameEngine.ts's chooseFirstPlayer (seed & 1). Its opening
    // hand includes BT1-010 "Agumon" (Lv.3, cost 3, 2000 DP). The protagonist (seat
    // 0, BLUE_DECK) opening hand includes BT1-031 "Monmon" (Lv.3, cost 4, 1000 DP),
    // which prints ＜Blocker＞ natively — found by exhaustively searching seeds,
    // mirroring mulligan.scenario.test.tsx's seed-4 search.
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: BLUE_DECK.mainDeck, eggDeck: BLUE_DECK.eggDeck },
      seed: 1,
    };

    render(<GameScreen joinOptions={joinOptions} identityColor="Blue" startMode="casual" onExit={() => {}} />);

    await screen.findByText(/finding an opponent/i);

    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Headless Opponent",
      deck: { mainDeck: RED_DECK.mainDeck, eggDeck: RED_DECK.eggDeck },
    });
    opponent.onDecision((req) => {
      if (req.kind === "mulligan") opponent.mulligan(true);
      else respondToHeadlessDecision(opponent, req);
    });
    opponent.ready();

    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    const yourBattleArea = () => document.querySelector('[data-drop="battle-you"]') as HTMLElement;

    // Turn 1 (opponent, first): skip breeding, play Agumon (cost 3).
    await vi.waitFor(() => expect(opponent.room.state.phase).not.toBe("None"), { timeout: 10_000 });
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(1), { timeout: 10_000 });
    if (opponent.room.state.phase === "Breeding") opponent.endPhase();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    const agumonEntry = opponent.room.state.players[1]!.hand.find((c) => c.cardId === "BT1-010")!;
    opponent.playCard(agumonEntry.instanceId);
    await vi.waitFor(() => expect(opponent.room.state.players[1]!.battleArea.length).toBe(1), { timeout: 10_000 });
    if (opponent.room.state.turnSeat === 1) opponent.endPhase();

    // Turn 2 (protagonist): skip breeding, play Monmon (cost 4).
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(0), { timeout: 10_000 });
    // The room can already have advanced through an empty breeding phase by the
    // time the UI patch arrives. Only drive the overlay when it is still open;
    // this scenario proves blocking, not a timing race in the breeding fixture.
    if (opponent.room.state.phase === "Breeding") {
      await endBreedingStep(20_000);
    }
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });

    // Wait for this client's Main patch before selecting; the headless room can
    // observe the phase first and a later client patch discards stale selections.
    await screen.findByRole("button", { name: /^end turn$/i }, { timeout: 10_000 });
    const monmonCard = within(screen.getByTestId("hand")).getByRole("button", { name: /^select monmon$/i });
    fireEvent.click(monmonCard);
    await vi.waitFor(() =>
      expect(
        within(screen.getByTestId("hand"))
          .getByRole("button", { name: /^select monmon$/i })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await vi.waitFor(
      () => expect(within(yourBattleArea()).getAllByRole("img", { name: /^monmon$/i })).toHaveLength(1),
      { timeout: 10_000 },
    );

    // Turn 3 (opponent): Agumon entered turn 1, so summoning sickness has cleared —
    // attack the protagonist's security directly. Monmon is an unsuspended
    // ＜Blocker＞, so a real block window opens on the protagonist's screen.
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(1), { timeout: 10_000 });
    if (opponent.room.state.phase === "Breeding") opponent.endPhase();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    const agumonPermanentId = opponent.room.state.players[1]!.battleArea[0]!.permanentId;
    opponent.attack(agumonPermanentId, { kind: "player" });

    // The centered block window lists each server-authorized blocker beside the
    // decline action.
    const blockPrompt = await screen.findByRole("dialog", { name: "Block window" }, { timeout: 10_000 });
    expect(within(blockPrompt).getByRole("button", { name: /take the attack/i })).toBeTruthy();
    const monmonBlockerButton = within(blockPrompt).getByRole("button", { name: /^monmon, 1,000 dp/i });
    const blocker = opponent.room.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.cardId === "BT1-031",
    )!;
    const blockerId = blocker.permanentId;
    const blockerCardId = blocker.topCard.instanceId;
    expect(blocker.isSuspended).toBe(false);
    fireEvent.click(monmonBlockerButton);

    // The attack is redirected onto Monmon instead of the protagonist's security —
    // the answered-outcome proof: security stays at 5 (never checked) while the
    // battle consumes Monmon (1000 DP) against Agumon (2000 DP) in its place.
    await vi.waitFor(() => expect(opponent.room.state.players[0]!.securityCount).toBe(5), { timeout: 10_000 });
    await vi.waitFor(() => expect(within(yourBattleArea()).queryByRole("img", { name: /^monmon$/i })).toBeNull(), {
      timeout: 10_000,
    });
    expect(opponent.room.state.players[0]!.securityCount).toBe(5);
    await vi.waitFor(
      () => {
        expect(opponent.room.state.players[0]!.securityCount).toBe(5);
        expect(
          opponent.room.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === blockerId),
        ).toBe(false);
        expect(opponent.room.state.players[0]!.trash.some((card) => card.instanceId === blockerCardId)).toBe(true);
        expect(
          opponent.room.state.players[1]!.battleArea.find((permanent) => permanent.permanentId === agumonPermanentId)
            ?.isSuspended,
        ).toBe(true);
      },
      { timeout: 10_000 },
    );

    await opponent.leave();
  }, 30_000);
});
