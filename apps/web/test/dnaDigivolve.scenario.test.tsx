// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import { Client, type Room } from "@colyseus/sdk";
import type { GameState } from "@aegis/shared";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

const DECK = swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-015", "BT1-051"), "BT1-016", "BT16-012");

scenario("dna-digivolve", () => {
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

  it("confirms red and yellow materials for Silphymon and preserves both exact instances at zero memory cost", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: DECK.mainDeck, eggDeck: DECK.eggDeck },
      seed: 114,
    };
    let protagonistRoom: Room<GameState> | undefined;
    const originalJoinOrCreate = Client.prototype.joinOrCreate;
    vi.spyOn(Client.prototype, "joinOrCreate").mockImplementation(async function (
      this: Client,
      ...args: Parameters<Client["joinOrCreate"]>
    ) {
      const room = await originalJoinOrCreate.apply(this, args);
      if (!protagonistRoom) protagonistRoom = room as Room<GameState>;
      return room;
    });
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
    const battle = () => document.querySelector('[data-drop="battle-you"]') as HTMLElement;
    const play = async (name: RegExp) => {
      tap(within(screen.getByTestId("hand")).getAllByRole("img", { name })[0]!);
      fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    };
    await endBreedingStep();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    await play(/^kokatorimon$/i);
    await vi.waitFor(
      () => expect(opponent.room.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT1-014")).toBe(true),
      { timeout: 10_000 },
    );
    const red = opponent.room.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT1-014")!;
    const redId = red.topCard.instanceId;
    const redPermId = red.permanentId;
    await endBreedingStep();
    await vi.waitFor(
      () => {
        expect(opponent.room.state.turnSeat).toBe(0);
        expect(opponent.room.state.phase).toBe("Main");
      },
      { timeout: 10_000 },
    );
    await play(/^reppamon$/i);
    await vi.waitFor(
      () => expect(opponent.room.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT1-051")).toBe(true),
      { timeout: 10_000 },
    );
    const yellow = opponent.room.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT1-051")!;
    const yellowId = yellow.topCard.instanceId;
    const yellowPermId = yellow.permanentId;
    expect(opponent.room.state.memory).toBe(0);
    const handBefore = opponent.room.state.players[0]!.handCount;
    const silphymonId = [...protagonistRoom!.state.players[0]!.hand].find((c) => c.cardId === "BT16-012")!.instanceId;

    await play(/^silphymon$/i);
    const dnaPrompt = () => screen.getByRole("region", { name: /DNA Digivolution available/i });
    expect(
      await screen.findByRole("region", { name: /DNA Digivolution available/i }, { timeout: 10_000 }),
    ).toBeTruthy();
    fireEvent.click(within(dnaPrompt()).getByRole("button", { name: /^cancel$/i }));
    expect(opponent.room.state.players[0]!.handCount).toBe(handBefore);
    expect(opponent.room.state.players[0]!.battleArea).toHaveLength(2);
    expect(opponent.room.state.memory).toBe(0);
    await play(/^silphymon$/i);
    await screen.findByRole("region", { name: /DNA Digivolution available/i }, { timeout: 10_000 });
    expect(
      within(dnaPrompt())
        .getByRole("button", { name: /^DNA Digivolve$/i })
        .hasAttribute("disabled"),
    ).toBe(true);
    // Materials are picked on the field, yellow first, as a player would.
    for (const permanentId of [yellowPermId, redPermId]) {
      tap(document.querySelector(`[data-drop="perm-you"][data-id="${permanentId}"]`) as HTMLElement);
    }
    fireEvent.click(within(dnaPrompt()).getByRole("button", { name: /^DNA Digivolve$/i }));
    await vi.waitFor(
      () => {
        const player = opponent.room.state.players[0]!;
        expect(player.battleArea).toHaveLength(1);
        const result = player.battleArea[0]!;
        expect(result.topCard.cardId).toBe("BT16-012");
        expect(result.topCard.instanceId).toBe(silphymonId);
        // CR 8-2-2-2: printed Red + Yellow puts Red above Yellow; stack is bottom-first.
        expect(result.stack.map((c) => c.instanceId)).toEqual([yellowId, redId]);
        expect(player.battleArea.some((p) => p.permanentId === redPermId || p.permanentId === yellowPermId)).toBe(
          false,
        );
        expect(player.trash.map((c) => c.instanceId)).not.toContain(redId);
        expect(player.trash.map((c) => c.instanceId)).not.toContain(yellowId);
        // DNA consumes the hand card and draws once, leaving the count unchanged.
        expect(player.handCount).toBe(handBefore);
        expect([...protagonistRoom!.state.players[0]!.hand].some((c) => c.instanceId === silphymonId)).toBe(false);
        expect(opponent.room.state.memory).toBe(0);
      },
      { timeout: 10_000 },
    );
    const resultEl = within(battle())
      .getByRole("img", { name: /^silphymon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    expect(within(resultEl).getByText(/^×2$/i)).toBeTruthy();
    tap(resultEl);
    expect(
      within(await screen.findByRole("group", { name: /^\d+ sources?$/i })).getByRole("button", {
        name: /^kokatorimon$/i,
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: /^\d+ sources?$/i })).getByRole("button", { name: /^reppamon$/i }),
    ).toBeTruthy();
    await opponent.leave();
  }, 60_000);
});
