// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep, endTurnStep } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import { Client, type Room } from "@colyseus/sdk";
import type { GameState } from "@aegis/shared";
import { getCardDefinition, isDigimon, type CardDefinition, type CardInstance } from "@aegis/shared";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

// BT15-009 "Meramon": Lv.4 Red, playCost 3, DP 4000, printed "[Main][Once Per Turn]
// By paying 2 cost, delete 1 of your opponent's Digimon with DP less than or equal
// to this Digimon's DP" (A3-proven in apps/api/src/engine/mechanic.test.ts, "A3
// activated [Main] — the activateEffect verb"). Swapped 1:1 for RED_DECK's BT1-013
// (same playCost, same count) so the deck stays legal and the swap lands in exactly
// the array slot BT1-013 held under the shuffle — see the seed search below.
const PROTAGONIST_DECK = swapMainDeckCard(RED_DECK, "BT1-013", "BT15-009");

scenario("activate-main", () => {
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

  it("activating a permanent's [Main] ability deletes the targeted opponent Digimon", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");

    // Seed 2: seat 0 (protagonist) goes first (even seed) and its dealt opening
    // hand includes BT15-009 (found by exhaustively searching seeds for the
    // swapped RED_DECK, mirroring mulligan.scenario.test.tsx's seed-4 search).
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: PROTAGONIST_DECK.mainDeck, eggDeck: PROTAGONIST_DECK.eggDeck },
      seed: 2,
    };

    let joinCallCount = 0;
    let protagonistRoom: Room<GameState> | undefined;
    const originalJoinOrCreate = Client.prototype.joinOrCreate;
    vi.spyOn(Client.prototype, "joinOrCreate").mockImplementation(async function (
      this: Client,
      ...args: Parameters<Client["joinOrCreate"]>
    ) {
      const callIndex = joinCallCount++;
      const room = await originalJoinOrCreate.apply(this, args);
      if (callIndex === 0) protagonistRoom = room as Room<GameState>;
      return room;
    });

    render(<GameScreen joinOptions={joinOptions} identityColor="Red" startMode="casual" onExit={() => {}} />);

    await screen.findByText(/finding an opponent/i);

    const opponent = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Headless Opponent",
      deck: { mainDeck: BLUE_DECK.mainDeck, eggDeck: BLUE_DECK.eggDeck },
    });

    // The opponent plays the cheapest Digimon in its hand with DP <= 4000
    // (Meramon's DP, so it's always a legal Delete target) as soon as its own Main
    // phase opens, then ends its turn — a real intent round trip, not injected
    // state; the exact card depends only on what BLUE_DECK deals under this seed.
    let opponentPlayed = false;
    let opponentTargetInstanceId: string | undefined;
    let opponentHandCountBeforePlay: number | undefined;
    let opponentDeckCountBeforePlay: number | undefined;
    opponent.onDecision((req) => {
      if (req.kind === "mulligan") opponent.mulligan(true);
    });
    opponent.room.onStateChange((state) => {
      if (state.turnSeat !== 1 || state.pendingDecision) return;
      if (state.phase === "Breeding") {
        opponent.endPhase();
        return;
      }
      if (state.phase !== "Main") return;
      if (!opponentPlayed) {
        const candidates: { c: CardInstance; def: CardDefinition }[] = [];
        for (const c of state.players[1]!.hand) {
          const def = getCardDefinition(c.cardId);
          if (def !== undefined && isDigimon(def) && (def.dp ?? 0) <= 4000) candidates.push({ c, def });
        }
        candidates.sort((a, b) => a.def.playCost - b.def.playCost);
        const target = candidates[0]?.c;
        if (target !== undefined) {
          opponentPlayed = true;
          opponentTargetInstanceId = target.instanceId;
          opponentHandCountBeforePlay = state.players[1]!.handCount;
          opponentDeckCountBeforePlay = state.players[1]!.deckCount;
          opponent.playCard(target.instanceId);
          return;
        }
      }
      opponent.endPhase();
    });
    opponent.ready();

    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));

    // Protagonist's own Breeding window: nothing to do, end breeding into Main, then
    // straight through Main (nothing to play yet) to pass the turn — the opponent
    // can't act until it's their turn.
    await endBreedingStep();
    await endTurnStep(10_000);

    // Wait for the opponent's real playCard round trip: their battle area
    // (rendered from synchronized state, not injected) goes from empty to one
    // Digimon.
    await vi.waitFor(() => expect(opponentPlayed).toBe(true), { timeout: 10_000 });
    await vi.waitFor(
      () => {
        const player = opponent.room.state.players[1]!;
        expect(player.battleArea.length).toBe(1);
        expect(player.battleArea[0]?.topCard.instanceId).toBe(opponentTargetInstanceId);
        expect(player.handCount).toBe(opponentHandCountBeforePlay! - 1);
        expect(player.deckCount).toBe(opponentDeckCountBeforePlay);
      },
      { timeout: 10_000 },
    );

    // Protagonist's second turn: skip breeding again.
    await endBreedingStep();

    // Play BT15-009 (Meramon) from hand into the battle area.
    const meramonImages = await within(screen.getByTestId("hand")).findAllByRole(
      "img",
      { name: /^meramon$/i },
      { timeout: 10_000 },
    );
    const meramonInstances = [...protagonistRoom!.state.players[0]!.hand].filter((card) => card.cardId === "BT15-009");
    expect(meramonInstances.length).toBe(meramonImages.length);
    const meramonInstanceId = meramonInstances[0]!.instanceId;
    const handCountBeforeMeramon = opponent.room.state.players[0]!.handCount;
    const deckCountBeforeMeramon = opponent.room.state.players[0]!.deckCount;
    const [meramonImg] = meramonImages;
    tap(meramonImg!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await vi.waitFor(
      () => {
        const player = opponent.room.state.players[0]!;
        expect(player.battleArea.length).toBe(1);
        expect(player.battleArea[0]?.topCard.instanceId).toBe(meramonInstanceId);
        expect(player.handCount).toBe(handCountBeforeMeramon - 1);
        expect(player.deckCount).toBe(deckCountBeforeMeramon);
      },
      { timeout: 10_000 },
    );

    // Pass the turn so Meramon is attack-capable on the way back: only then does
    // the board wire the permanent for a drag (attack) rather than a click, which
    // is the arrangement the activation has to survive on touch.
    await endTurnStep(10_000);
    await endBreedingStep();

    // Activate Meramon's [Main] ability the way a player does: an attack-capable
    // Digimon is drag-wired, so a non-moving tap on it opens the card action menu
    // (GameScreen's handleTap), and the activation is an entry in that menu, named
    // after the effect it activates.
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    const memoryBeforeActivation = opponent.room.state.memory;
    const opponentHandBeforeActivation = opponent.room.state.players[1]!.handCount;
    const opponentDeckBeforeActivation = opponent.room.state.players[1]!.deckCount;
    expect(opponent.room.state.turnSeat).toBe(0);
    expect(memoryBeforeActivation).toBe(3);
    const meramonPermEl = (await vi.waitFor(
      () => {
        const perm = screen
          .getAllByRole("img", { name: /^meramon$/i })
          .map((img) => img.closest('[data-drop="perm-you"]'))
          .find((el): el is HTMLElement => el !== null);
        expect(perm).toBeTruthy();
        return perm;
      },
      { timeout: 10_000 },
    ))!;
    tap(meramonPermEl);
    fireEvent.click(await screen.findByRole("button", { name: /^activate effect: .*delete/i }, { timeout: 10_000 }));

    // The activation pays its "2 cost" and deletes the sole legal opponent Digimon
    // target: proven on the protagonist's own rendered DOM by the opponent's
    // battle-area placeholder ("no Digimon in play") reappearing, while the
    // protagonist's own side still renders Meramon.
    await screen.findByText(/no digimon in play/i, {}, { timeout: 10_000 });
    await screen.findByText(/memory \+1/i, {}, { timeout: 10_000 });
    expect(screen.getAllByText(/no digimon in play/i)).toHaveLength(1); // only the opponent's side is empty
    expect(screen.getAllByRole("img", { name: /^meramon$/i }).length).toBeGreaterThan(0);
    await vi.waitFor(
      () => {
        const targetPlayer = opponent.room.state.players[1]!;
        expect(opponent.room.state.memory).toBe(memoryBeforeActivation - 2);
        expect(targetPlayer.battleArea.length).toBe(0);
        expect(targetPlayer.trash.some((card) => card.instanceId === opponentTargetInstanceId)).toBe(true);
        expect(targetPlayer.handCount).toBe(opponentHandBeforeActivation);
        expect(targetPlayer.deckCount).toBe(opponentDeckBeforeActivation);
      },
      { timeout: 10_000 },
    );
    expect(screen.getByRole("list", { name: /^opponent$/i }).textContent).toContain(
      `Trash: ${opponent.room.state.players[1]!.trash.length} discarded`,
    );

    await opponent.leave();
  }, 60_000);
});
