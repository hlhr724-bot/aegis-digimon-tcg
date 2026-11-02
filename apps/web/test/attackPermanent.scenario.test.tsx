// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep, endTurnStep } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

/**
 * Proves historical migration ledger behavioral scenario "attack-permanent":
 * declaring an attack against a suspended opponent Digimon through the real UI
 * resolves a real battle — the lower-DP Digimon (the opponent's) is deleted while
 * the higher-DP attacker survives.
 */
scenario("attack-permanent", () => {
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

  it("attacking a suspended opponent Digimon deletes it in battle", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    // Seed 162: seat 0 (protagonist, RED_DECK) goes first and its dealt opening
    // hand includes BT1-013 "Muchomon" (Lv.3, cost 3, 5000 DP). The headless
    // opponent's (BLUE_DECK) opening hand includes BT1-032 "Frigimon" (Lv.4, cost 4,
    // 4000 DP) — found by exhaustively searching seeds, mirroring
    // mulligan.scenario.test.tsx's seed-4 search. Muchomon's 5000 DP exceeds
    // Frigimon's 4000 DP so the final battle below has an unambiguous, deterministic
    // outcome; Frigimon's 4000 DP was also chosen to beat this seed's deterministic
    // top security card (BT1-009 "Monodramon", 3000 DP) so its earlier player-attack
    // (turn 4, to legally become suspended) survives its mandatory security battle
    // (Comprehensive Rules: a revealed Digimon security card battles the attacker).
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: RED_DECK.mainDeck, eggDeck: RED_DECK.eggDeck },
      seed: 162,
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

    const yourBattleArea = () => document.querySelector('[data-drop="battle-you"]') as HTMLElement;

    // Turn 1 (protagonist): skip breeding, play Muchomon (cost 3, memory 0 -> -3,
    // crosses — fine, Muchomon is already placed).
    await endBreedingStep();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });

    const [muchomonImg] = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^muchomon$/i });
    tap(muchomonImg!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await vi.waitFor(
      () => expect(within(yourBattleArea()).getAllByRole("img", { name: /^muchomon$/i })).toHaveLength(1),
      { timeout: 10_000 },
    );

    // Turn 2 (opponent): skip breeding, play Frigimon (cost 4) — crosses; fine.
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(1), { timeout: 10_000 });
    if (opponent.room.state.phase === "Breeding") opponent.endPhase();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    const frigimonEntry = opponent.room.state.players[1]!.hand.find((c) => c.cardId === "BT1-032")!;
    opponent.playCard(frigimonEntry.instanceId);
    await vi.waitFor(() => expect(opponent.room.state.players[1]!.battleArea.length).toBe(1), { timeout: 10_000 });
    // The gauge is turn-relative (apps/api/src/engine/MemoryGauge.ts): whether
    // paying Frigimon's cost lands exactly on the opponent's crossing threshold
    // depends on turn 1's exact overshoot, so end the phase explicitly rather than
    // assume it auto-crossed — a redundant endPhase after an already-crossed Main
    // is a same-seat no-op, so this is safe either way.
    if (opponent.room.state.turnSeat === 1) opponent.endPhase();

    // Turn 3 (protagonist): nothing to play — pass straight through, banking the
    // opponent's pass-turn +3 for turn 4 (not needed for an attack, but keeps the
    // match moving identically to the other scenarios' pattern).
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(0), { timeout: 10_000 });
    await endBreedingStep();
    await endTurnStep(10_000);

    // Turn 4 (opponent): Frigimon entered turn 2, so summoning sickness has cleared
    // by turn 4 — attack the protagonist's security directly, suspending Frigimon.
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(1), { timeout: 10_000 });
    if (opponent.room.state.phase === "Breeding") opponent.endPhase();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    const frigimonPermanentId = opponent.room.state.players[1]!.battleArea[0]!.permanentId;
    opponent.attack(frigimonPermanentId, { kind: "player" });
    // Wait for the entire attack (declare -> block window -> security check) to
    // finish resolving server-side, not just the immediate suspend-on-declare.
    await vi.waitFor(() => expect(opponent.room.state.players[0]!.securityCount).toBe(4), { timeout: 10_000 });
    // The attack checks the protagonist's own security — the protagonist's client
    // stages the real security clash for it (the revealed card, per this seed's
    // deterministic security stack, battles Frigimon and loses). Wait for the scene
    // instead of querying once: the securityCount assertion above observes SERVER
    // state, which the client's event delivery and render lag behind. The scene
    // retires on its own timer, so turn 5's Breeding overlay is only suppressed
    // while it is on screen.
    expect(opponent.room.state.gameOver).toBe(false);
    const clash = await screen.findByTestId("security-clash", {}, { timeout: 10_000 });
    expect(clash.getAttribute("role")).toBe("status");
    expect(within(clash).getByText(/^Security check$/i)).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByTestId("security-clash")).toBeNull(), { timeout: 10_000 });

    opponent.endPhase();

    // Turn 5 (protagonist): Muchomon entered turn 1, so it may attack. Open its
    // card menu (a tap: pointerdown+pointerup with no movement — the same gesture
    // digivolveNormal.scenario.test.tsx uses to open "View stack" for a legal
    // attacker, since any attack-eligible permanent is "draggable" and its plain
    // onClick is stripped in favor of the drag-to-attack onPointerDown;
    // GameScreen.tsx's handleTap still routes a non-moving tap to the card menu).
    await vi.waitFor(() => expect(opponent.room.state.turnSeat).toBe(0), { timeout: 10_000 });
    if (opponent.room.state.phase === "Breeding") {
      await endBreedingStep();
    }
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });

    const muchomonPermEl = within(yourBattleArea())
      .getByRole("img", { name: /^muchomon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    tap(muchomonPermEl);
    fireEvent.click(await screen.findByRole("button", { name: /^attack$/i }, { timeout: 10_000 }));

    // With an attacker selected, a suspended opponent permanent becomes a legal
    // attack target (GameScreen.tsx's onOppPerm: `selPerm && perm.isSuspended`).
    // Captured before the attack resolves and deletes Frigimon: its own
    // `[data-drop="perm-opp"]` attribute lives on the permanent (not the
    // container), so it disappears from the DOM once Frigimon is gone — the
    // container div itself persists (React reuses it), so hold this reference.
    const oppBattleArea = document.querySelector('[data-drop="perm-opp"]')!.parentElement as HTMLElement;
    const frigimonTargetEl = within(oppBattleArea)
      .getByRole("img", { name: /^frigimon$/i })
      .closest('[data-drop="perm-opp"]') as HTMLElement;
    const frigimonInstanceId = opponent.room.state.players[1]!.battleArea[0]!.topCard!.instanceId;
    const muchomonInstanceId = opponent.room.state.players[0]!.battleArea[0]!.topCard!.instanceId;
    fireEvent.click(frigimonTargetEl);

    // The battle resolves: Frigimon (4000 DP) is deleted by Muchomon (5000 DP) — the
    // opponent's battle area returns to empty (querying only the battle area, not
    // the whole document, since the deleted Frigimon still renders as the top card
    // of the opponent's trash pile thumbnail elsewhere on screen — correctly, since
    // that's where a deleted Digimon actually goes), while Muchomon survives.
    await vi.waitFor(
      () => {
        const opponentState = opponent.room.state.players[1]!;
        const protagonistState = opponent.room.state.players[0]!;
        expect(opponentState.battleArea.some((permanent) => permanent.topCard?.instanceId === frigimonInstanceId)).toBe(
          false,
        );
        expect(opponentState.trash.map((card) => card.instanceId)).toContain(frigimonInstanceId);
        expect(protagonistState.battleArea.map((permanent) => permanent.topCard?.instanceId)).toContain(
          muchomonInstanceId,
        );
      },
      { timeout: 10_000 },
    );

    const opponentTrash = document.querySelector(".game-utility-slot--opp-trash") as HTMLElement;
    await vi.waitFor(
      () => {
        expect(within(oppBattleArea).queryByRole("img", { name: /^frigimon$/i })).toBeNull();
        expect(within(opponentTrash).getByAltText(/^frigimon$/i)).toBeTruthy();
        expect(within(yourBattleArea()).getAllByRole("img", { name: /^muchomon$/i })).toHaveLength(1);
      },
      { timeout: 10_000 },
    );

    await opponent.leave();
  }, 60_000);
});
