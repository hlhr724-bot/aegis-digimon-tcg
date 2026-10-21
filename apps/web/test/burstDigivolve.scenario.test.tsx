// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep, findEndBreedingControl } from "./scenarioHarness/breedingStep";
import { tap } from "./scenarioHarness/tap";
import { dragOnto } from "./scenarioHarness/dragDrop";
import { resolveIncidentalDecisionsThroughUi } from "./scenarioHarness/decisions";
import { Client, type Room } from "@colyseus/sdk";
import type { GameState } from "@aegis/shared";
import type { AegisJoinOptions } from "../src/net/types";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { swapMainDeckCard } from "./scenarioHarness/decks";
import { scenario } from "./scenarioHarness/scenario";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

const DECK = swapMainDeckCard(
  swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-085", "BT12-092"), "BT1-025", "BT13-018"),
  "BT1-020",
  "BT13-020",
);

scenario("burst-digivolve", () => {
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

  it("returns the exact Marcus Damon from play to pay ShineGreymon Burst Mode's zero-cost route", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");
    const joinOptions: AegisJoinOptions & { seed?: number } = {
      displayName: "Protagonist",
      deck: { mainDeck: DECK.mainDeck, eggDeck: DECK.eggDeck },
      seed: 6,
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
    await play(/^marcus damon$/i);
    await vi.waitFor(
      () => expect(opponent.room.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT12-092")).toBe(true),
      { timeout: 10_000 },
    );
    const marcus = opponent.room.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT12-092")!;
    const marcusId = marcus.topCard.instanceId;
    await endBreedingStep();
    await vi.waitFor(
      () => {
        expect(opponent.room.state.turnSeat).toBe(0);
        expect(opponent.room.state.phase).toBe("Main");
      },
      { timeout: 10_000 },
    );
    expect(opponent.room.state.memory).toBe(3);
    await play(/^shinegreymon$/i);
    await vi.waitFor(
      () => expect(opponent.room.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT13-018")).toBe(true),
      { timeout: 10_000 },
    );
    const shine = opponent.room.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT13-018")!;
    const shineId = shine.topCard.instanceId;
    const shinePermId = shine.permanentId;
    // Marcus's Start of Main Phase question keeps ordinary actions disabled until
    // it is answered, so wait for breeding to unlock, then resolve that question.
    fireEvent.click(await findEndBreedingControl());
    await vi.waitFor(
      () => {
        expect(opponent.room.state.turnSeat).toBe(0);
        expect(opponent.room.state.phase).toBe("Main");
      },
      { timeout: 10_000 },
    );
    if (opponent.room.state.pendingDecision) await resolveIncidentalDecisionsThroughUi(opponent);
    expect(opponent.room.state.memory).toBe(3);
    const shineEl = within(battle())
      .getByRole("img", { name: /^shinegreymon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    const burstId = [...protagonistRoom!.state.players[0]!.hand].find((c) => c.cardId === "BT13-020")!.instanceId;
    dragOnto(
      within(screen.getByTestId("hand")).getAllByRole("img", { name: /^shinegreymon: burst mode$/i })[0]!,
      shineEl,
    );
    const burstOption = await screen.findByRole(
      "button",
      { name: /shinegreymon lv\.6.*0 memory/i },
      { timeout: 10_000 },
    );
    expect(burstOption).toBeTruthy();
    expect(screen.getByRole("button", { name: /red lv\.6.*5 memory/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(
      opponent.room.state.players[0]!.battleArea.find((p) => p.permanentId === shinePermId)!.topCard.instanceId,
    ).toBe(shineId);
    expect(opponent.room.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === marcusId)).toBe(true);
    expect(opponent.room.state.memory).toBe(3);
    dragOnto(
      within(screen.getByTestId("hand")).getAllByRole("img", { name: /^shinegreymon: burst mode$/i })[0]!,
      shineEl,
    );
    fireEvent.click(await screen.findByRole("button", { name: /shinegreymon lv\.6.*0 memory/i }, { timeout: 10_000 }));
    await vi.waitFor(
      () => {
        const player = opponent.room.state.players[0]!;
        const result = player.battleArea.find((p) => p.permanentId === shinePermId)!;
        expect(result.topCard.cardId).toBe("BT13-020");
        expect(result.topCard.instanceId).toBe(burstId);
        expect(result.stack.map((c) => c.instanceId)).toEqual([shineId]);
        expect(player.battleArea.some((p) => p.topCard.instanceId === marcusId)).toBe(false);
        expect(player.trash.map((c) => c.instanceId)).not.toContain(marcusId);
        expect(opponent.room.state.memory).toBe(3);
        expect([...protagonistRoom!.state.players[0]!.hand].some((c) => c.instanceId === burstId)).toBe(false);
      },
      { timeout: 10_000 },
    );
    if (opponent.room.state.pendingDecision) await resolveIncidentalDecisionsThroughUi(opponent);
    await vi.waitFor(
      () => expect([...protagonistRoom!.state.players[0]!.hand].some((c) => c.instanceId === marcusId)).toBe(true),
      { timeout: 10_000 },
    );
    expect(within(screen.getByTestId("hand")).getAllByRole("img", { name: /^marcus damon$/i }).length).toBeGreaterThan(
      0,
    );
    const resultEl = within(battle())
      .getByRole("img", { name: /^shinegreymon: burst mode$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    expect(within(resultEl).getByText(/^×1$/i)).toBeTruthy();
    await opponent.leave();
  }, 60_000);
});
