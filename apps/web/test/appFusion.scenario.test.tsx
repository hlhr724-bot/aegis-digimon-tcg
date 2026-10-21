// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { endBreedingStep } from "./scenarioHarness/breedingStep";
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
  swapMainDeckCard(swapMainDeckCard(RED_DECK, "BT1-014", "BT23-016"), "BT1-015", "BT23-039"),
  "BT1-016",
  "BT23-021",
);

scenario("app-fusion", () => {
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

  it("links Perorimon then fuses Dosukomon through the UI, preserving host and linked instances for zero memory", async () => {
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
    await endBreedingStep();
    await vi.waitFor(() => expect(opponent.room.state.phase).toBe("Main"), { timeout: 10_000 });
    tap(within(screen.getByTestId("hand")).getAllByRole("img", { name: /^dokamon$/i })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /play (digimon|tamer|option)/i }));
    await vi.waitFor(
      () => expect(opponent.room.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT23-016")).toBe(true),
      { timeout: 10_000 },
    );
    const host = opponent.room.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT23-016")!;
    const hostId = host.permanentId;
    const hostCardId = host.topCard.instanceId;
    await endBreedingStep();
    await vi.waitFor(
      () => {
        expect(opponent.room.state.turnSeat).toBe(0);
        expect(opponent.room.state.phase).toBe("Main");
      },
      { timeout: 10_000 },
    );
    expect(opponent.room.state.memory).toBe(3);
    tap(within(screen.getByTestId("hand")).getAllByRole("img", { name: /^perorimon$/i })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /^link$/i }, { timeout: 10_000 }));
    const hostEl = within(battle())
      .getByRole("img", { name: /^dokamon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    tap(hostEl);
    await vi.waitFor(
      () => {
        const linkedHost = opponent.room.state.players[0]!.battleArea.find((p) => p.permanentId === hostId)!;
        expect(linkedHost.linked.map((c) => c.cardId)).toEqual(["BT23-039"]);
        expect(opponent.room.state.memory).toBe(2);
      },
      { timeout: 10_000 },
    );
    const linkedId = opponent.room.state.players[0]!.battleArea.find((p) => p.permanentId === hostId)!.linked[0]!
      .instanceId;
    if (opponent.room.state.pendingDecision) await resolveIncidentalDecisionsThroughUi(opponent);
    const fusionId = [...protagonistRoom!.state.players[0]!.hand].find((c) => c.cardId === "BT23-021")!.instanceId;
    await vi.waitFor(
      () => {
        const result = [...protagonistRoom!.state.players[0]!.hand].find((c) => c.cardId === "BT23-021")!;
        expect(
          result.appFusionRoutes?.some((r) => r.hostPermanentId === hostId && r.linkedInstanceId === linkedId),
        ).toBe(true);
      },
      { timeout: 10_000 },
    );
    const handBefore = opponent.room.state.players[0]!.handCount;
    const currentHost = () =>
      within(battle())
        .getByRole("img", { name: /^dokamon$/i })
        .closest('[data-drop="perm-you"]') as HTMLElement;
    const fusionImg = within(screen.getByTestId("hand")).getAllByRole("img", { name: /^dosukomon$/i })[0]!;
    dragOnto(fusionImg, currentHost());
    expect(await screen.findByRole("heading", { name: /app fusion/i }, { timeout: 10_000 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(opponent.room.state.players[0]!.handCount).toBe(handBefore);
    expect(
      opponent.room.state.players[0]!.battleArea.find((p) => p.permanentId === hostId)!.linked[0]!.instanceId,
    ).toBe(linkedId);
    expect(opponent.room.state.memory).toBe(2);
    dragOnto(within(screen.getByTestId("hand")).getAllByRole("img", { name: /^dosukomon$/i })[0]!, currentHost());
    const choice = await screen.findByRole("radio", { name: /perorimon.*cost: 0/i }, { timeout: 10_000 });
    expect((choice as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^app fuse$/i }));
    await vi.waitFor(
      () => {
        const player = opponent.room.state.players[0]!;
        expect(player.battleArea).toHaveLength(1);
        const result = player.battleArea[0]!;
        expect(result.permanentId).toBe(hostId);
        expect(result.topCard.cardId).toBe("BT23-021");
        expect(result.topCard.instanceId).toBe(fusionId);
        expect(result.stack.map((c) => c.instanceId)).toEqual([hostCardId, linkedId]);
        expect(result.linked).toHaveLength(0);
        expect(player.trash.map((c) => c.instanceId)).not.toContain(linkedId);
        expect(player.handCount).toBe(handBefore);
        expect([...protagonistRoom!.state.players[0]!.hand].some((c) => c.instanceId === fusionId)).toBe(false);
        expect(opponent.room.state.memory).toBe(2);
      },
      { timeout: 10_000 },
    );
    const resultEl = within(battle())
      .getByRole("img", { name: /^dosukomon$/i })
      .closest('[data-drop="perm-you"]') as HTMLElement;
    expect(within(resultEl).getByText(/^×2$/i)).toBeTruthy();
    await opponent.leave();
  }, 60_000);
});
