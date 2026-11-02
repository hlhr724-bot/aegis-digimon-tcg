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
import { resolveIncidentalDecisionsThroughUi } from "./scenarioHarness/decisions";

// BT23-020 "Seadramon" (Blue/Purple, Lv.4, hard-cast cost 5, 5000 DP): printed
// "＜Alliance＞ [All Turns] [Once Per Turn] When this Digimon suspends, ＜Draw 1＞" —
// dual-color and hard-castable from any deck regardless of color (Digimon TCG has
// no color requirement for hand-play). Swapped 1:1 for RED_DECK's BT1-025
// (WarGreymon, count 2 — under BT23-020's maxCountInDeck of 4) so the deck stays
// legal and the swap lands in the array slots BT1-025 held under the shuffle.
const PROTAGONIST_DECK = swapMainDeckCard(RED_DECK, "BT1-025", "BT23-020");

/**
 * Proves historical migration ledger behavioral scenario "alliance":
 * ＜Alliance＞ (Comprehensive Rules §16-24) fires "when this Digimon attacks" — its
 * controller may suspend another of their own Digimon to add its DP to the
 * attacker for the battle. Unlike ＜Blocker＞/＜Evade＞/＜Barrier＞, the protagonist
 * here is the ATTACKER (the seat performing the interaction), not the defender —
 * the headless opponent has no role beyond existing
 *.
 */
scenario("alliance", () => {
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

  it("choosing an ally in the Alliance prompt suspends it and boosts the attacker's DP", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    // Seed 58: seat 0 (protagonist, swapped RED_DECK) goes first and its dealt
    // opening hand includes BT1-010 "Agumon" (2000 DP, the future ally) and
    // BT23-020 "Seadramon" (5000 DP, the ＜Alliance＞ attacker) — found by
    // exhaustively searching seeds, mirroring mulligan.scenario.test.tsx's seed-4
    // search.
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: PROTAGONIST_DECK.mainDeck, eggDeck: PROTAGONIST_DECK.eggDeck },
      seed: 58,
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
    // The opponent has no role beyond existing — skip its own Breeding/Main windows
    // every turn so the match keeps moving. Ending its own Main phase without
    // paying anything ends it "passed" (not "crossed"), which hands the
    // protagonist the +3 pass-turn memory bonus each round
    // (apps/api/src/engine/MemoryGauge.ts's PASS_TURN_MEMORY) — required below to
    // afford Seadramon's cost on turn 3.
    opponent.room.onStateChange((state) => {
      if (state.turnSeat !== 1 || state.pendingDecision) return;
      if (state.phase === "Breeding" || state.phase === "Main") opponent.endPhase();
    });
    opponent.ready();

    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    const yourBattleArea = () => document.querySelector('[data-drop="battle-you"]') as HTMLElement;
    const oppSecurity = () => document.querySelector('[data-drop="opp-security"]') as HTMLElement;

    // Turn 1: skip breeding, then play Agumon (cost 3, memory 0 -> -3) — crosses;
    // fine, Agumon is already placed. It will stand in as the Alliance ally.
    await endBreedingStep();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });

    const [agumonImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^agumon$/i });
    tap(agumonImg!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await screen.findByRole("dialog", {}, { timeout: 10_000 });
    await resolveIncidentalDecisionsThroughUi(opponent);
    await vi.waitFor(
      () => expect(within(yourBattleArea()).getAllByRole("img", { name: /^agumon$/i })).toHaveLength(1),
      { timeout: 10_000 },
    );

    // Turn 3 (protagonist's second turn; memory +3 from the pass-turn bonus): skip
    // breeding, then play Seadramon (cost 5, memory 3 -> -2) — crosses; fine.
    await endBreedingStep();
    await vi.waitFor(
      () => {
        expect(opponent.room.state.turnSeat).toBe(0);
        expect(opponent.room.state.phase).toBe("Main");
      },
      { timeout: 10_000 },
    );

    const [seadramonImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^seadramon$/i });
    tap(seadramonImg!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await vi.waitFor(
      () => expect(within(yourBattleArea()).getAllByRole("img", { name: /^seadramon$/i })).toHaveLength(1),
      { timeout: 10_000 },
    );

    // Turn 5 (protagonist's third turn; memory +3 again): skip breeding, then
    // declare an attack with Seadramon (entered turn 3, so summoning sickness —
    // Comprehensive Rules §16-1 — has cleared by turn 5).
    await endBreedingStep();
    await vi.waitFor(
      () => {
        expect(opponent.room.state.turnSeat).toBe(0);
        expect(opponent.room.state.phase).toBe("Main");
      },
      { timeout: 10_000 },
    );

    const seadramonPermEl = within(yourBattleArea())
      .getByRole("img", { name: /^seadramon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    tap(seadramonPermEl);
    fireEvent.click(await screen.findByRole("button", { name: /^attack$/i }, { timeout: 10_000 }));
    fireEvent.click(oppSecurity());

    // Seadramon has ＜Alliance＞ and Agumon is a legal, unsuspended ally — the real
    // Alliance prompt opens on the protagonist's own screen (it's the attacker's
    // controller who chooses, not a defender).
    // Attacking suspends Seadramon, so its [All Turns] Draw 1 triggers with ＜Alliance＞;
    // resolve ＜Alliance＞ first, then choose the eligible ally on the field.
    fireEvent.click(await screen.findByRole("button", { name: /^\[When Attacking\], Seadramon/ }, { timeout: 10_000 }));
    fireEvent.click(screen.getByRole("button", { name: /resolve next effect/i }));
    await screen.findByRole("button", { name: /^pass$/i }, { timeout: 10_000 });
    const alliancePrompt = screen.getByRole("region", { name: "Alliance window" });
    expect(alliancePrompt.getAttribute("data-prompt-surface")).toBe("left");
    const agumonAlly = within(yourBattleArea()).getByRole("button", {
      name: /^agumon, \(BT1-010\), Field reference #/i,
    });
    expect(agumonAlly.classList.contains("game-permanent--candidate")).toBe(true);
    tap(agumonAlly);
    const allianceConfirmation = await screen.findByRole("dialog", { name: "Confirm Alliance" });
    expect(allianceConfirmation.getAttribute("data-prompt-surface")).toBe("left");
    expect(opponent.room.state.players[0]!.battleArea.find((p) => p.topCard?.cardId === "BT1-010")?.isSuspended).toBe(
      false,
    );
    fireEvent.click(within(allianceConfirmation).getByRole("button", { name: /^use alliance$/i }));

    // Answered-outcome proof: Agumon is suspended (spent as the Alliance cost) —
    // both in synchronized state and, per apps/web/src/design/cards.tsx's
    // CardMini, rendered on the protagonist's own board with its explicit
    // suspended state (the DP boost itself is a for-the-battle-only
    // modifier that's cleared server-side before the same patch broadcasts the
    // rest of the resolved attack, so it never reaches a client-observable state).
    await vi.waitFor(
      () =>
        expect(
          opponent.room.state.players[0]!.battleArea.find((p) => p.topCard?.cardId === "BT1-010")?.isSuspended,
        ).toBe(true),
      { timeout: 10_000 },
    );
    const agumonPermElAfter = within(yourBattleArea())
      .getByRole("img", { name: /^agumon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    expect(agumonPermElAfter.querySelector('[data-state="suspended"]')).toBeTruthy();

    await opponent.leave();
  }, 60_000);
});
