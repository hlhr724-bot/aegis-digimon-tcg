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
import { respondToHeadlessDecision } from "./scenarioHarness/decisions";
import { GameScreen } from "../src/game/GameScreen";

// BT14-025 "Shellmon" (Blue, Lv.4, cost 5, 6000 DP): printed "＜Evade＞ (When this
// Digimon would be deleted, you may suspend it to prevent that deletion.)" with no
// other clause — a pure keyword card. Cost 5 is deliberate (see the memory-gauge
// note below). Swapped 1:1 for BLUE_DECK's BT1-043 (SaberLeomon, count 2 — under
// BT14-025's maxCountInDeck of 4), mirroring barrier.scenario.test.tsx's swap of
// the same slot.
const PROTAGONIST_DECK = swapMainDeckCard(BLUE_DECK, "BT1-043", "BT14-025");

// BT14-014 "MetalGreymon" (Red, Lv.5, cost 4, 8000 DP): printed "[On Play][When
// Digivolving] Delete 1 of your opponent's Digimon with 6000 DP or less." — an
// EFFECT deletion (not a battle-loss one), which is the path this scenario proves:
// Evade is architecturally unreachable from the combat/battle-loss path (a
// Security Digimon is never "deleted by battle" per Comprehensive Rules §14-2-3,
// and every other combat deletion path involves an already-suspended Digimon), so
// only an effect-driven delete can ever raise the Evade prompt for an unsuspended
// target. Its compiled IR targets "1 of your opponent's Digimon with DP<=6000" —
// with Shellmon (6000 DP) the only candidate, the interpreter auto-resolves the
// target (no extra decision window). Swapped 1:1 for RED_DECK's BT1-025
// (WarGreymon, count 2 — under BT14-014's maxCountInDeck of 4).
const OPPONENT_DECK = swapMainDeckCard(RED_DECK, "BT1-025", "BT14-014");

/**
 * Proves historical migration ledger behavioral scenario "evade": when an
 * EFFECT (not battle) would delete a ＜Evade＞ Digimon, the protagonist (its
 * controller) can accept the real Evade prompt through the UI to suspend it instead,
 * preventing the deletion. The
 * protagonist is the DEFENDER/controller of the Evade Digimon; the headless
 * opponent plays the deletion effect (BT14-014) that would delete it.
 */
scenario("evade", () => {
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

  it("accepting the Evade prompt suspends the Digimon instead of deleting it", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);

    // Seed 118: seat 0 (protagonist, swapped BLUE_DECK) goes first and its dealt
    // opening hand includes BT14-025 "Shellmon". The headless opponent's (swapped
    // RED_DECK) opening hand includes BT14-014 "MetalGreymon" — found by
    // exhaustively searching seeds, mirroring barrier.scenario.test.tsx's seed-206
    // search.
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: PROTAGONIST_DECK.mainDeck, eggDeck: PROTAGONIST_DECK.eggDeck },
      seed: 118,
    };

    render(<GameScreen joinOptions={joinOptions} identityColor="Blue" startMode="casual" onExit={() => {}} />);

    await screen.findByText(/finding an opponent/i);

    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Headless Opponent",
      deck: { mainDeck: OPPONENT_DECK.mainDeck, eggDeck: OPPONENT_DECK.eggDeck },
    });
    opponent.onDecision((req) => {
      if (req.kind === "mulligan") opponent.mulligan(true);
      else respondToHeadlessDecision(opponent, req);
    });
    opponent.ready();

    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    const yourBattleArea = () => document.querySelector('[data-drop="battle-you"]') as HTMLElement;

    // Turn 1 (protagonist): skip breeding, play Shellmon (cost 5). Paying a
    // nonzero cost from a memory gauge starting at 0 immediately crosses it to the
    // opponent's side, ending the Main phase right there (same mechanic
    // barrier.scenario.test.tsx and target-decision.scenario.test.tsx rely on) —
    // handing the opponent 5 memory for turn 2, comfortably above MetalGreymon's
    // cost of 4.
    await endBreedingStep();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });

    const [shellmonImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^shellmon$/i });
    tap(shellmonImg!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await vi.waitFor(
      () => expect(within(yourBattleArea()).getAllByRole("img", { name: /^shellmon$/i })).toHaveLength(1),
      { timeout: 10_000 },
    );

    // Turn 2 (opponent): skip breeding, play MetalGreymon (cost 4, under the 5
    // memory the opponent was handed — paying it leaves memory at 1 in the
    // opponent's favor, which does NOT cross back to the protagonist, so the
    // opponent's Main phase stays open and the suspended-Evade state below is
    // observable before any unsuspend step could run). Its [On Play] deletes the
    // lone opponent Digimon with DP<=6000 — Shellmon (6000 DP) is the only
    // candidate, so the engine auto-resolves the target (no decision window)
    // straight into deletePermanent, where the real (not battle) Evade prompt
    // opens on the protagonist's screen.
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(1), { timeout: 10_000 });
    if (opponent.room.state.phase === "Breeding") opponent.endPhase();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    const metalGreymonEntry = opponent.room.state.players[1]!.hand.find((c) => c.cardId === "BT14-014")!;
    opponent.playCard(metalGreymonEntry.instanceId);

    // MetalGreymon's [On Play] would delete Shellmon — the real Evade prompt
    // opens on the protagonist's screen (EvadeOverlay, evadePrompt event).
    const evadePrompt = await screen.findByRole("dialog", { name: "＜Evade＞" }, { timeout: 10_000 });
    expect(evadePrompt.getAttribute("data-prompt-surface")).toBe("left");
    expect(within(evadePrompt).getByText(/you may suspend it to prevent that deletion/i)).toBeTruthy();
    const acceptButton = within(evadePrompt).getByRole("button", { name: /^use$/i });
    fireEvent.click(acceptButton);

    // Answered-outcome proof: Shellmon SURVIVES — still rendered in the
    // protagonist's battle area (not deleted, not in trash) — and, per
    // apps/web/src/design/cards.tsx's CardMini, rendered with its explicit
    // suspended state (the cost of accepting Evade), instead of being
    // trashed. Turn 2 does not cross back (memory lands at +1 for the opponent),
    // so this state is observable before any unsuspend step could run.
    await vi.waitFor(
      () =>
        expect(
          opponent.room.state.players[0]!.battleArea.find((p) => p.topCard?.cardId === "BT14-025")?.isSuspended,
        ).toBe(true),
      { timeout: 10_000 },
    );
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "＜Evade＞" })).toBeNull(), {
      timeout: 10_000,
    });
    const shellmonPermElAfter = within(yourBattleArea())
      .getByRole("img", { name: /^shellmon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    expect(shellmonPermElAfter.querySelector('[data-state="suspended"]')).toBeTruthy();
    expect(opponent.room.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT14-025")).toBe(true);
    expect(opponent.room.state.players[0]!.trash.some((c) => c.cardId === "BT14-025")).toBe(false);

    await opponent.leave();
  }, 20_000);
});
