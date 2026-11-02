// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "./scenarioHarness/testingLibrary";
import { RED_DECK, BLUE_DECK } from "@aegis-api/engine/testDecks.js";
import { Client } from "@colyseus/sdk";
import { ROOM_TYPE_BOT } from "@aegis/shared";
import { startTestServer, type TestServer } from "./scenarioHarness/server";
import { joinHeadlessOpponent } from "./scenarioHarness/headlessOpponent";

describe("rendered beta battle against a real room", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    cleanup();
    await server.close();
    vi.unstubAllEnvs();
  });

  it("starts an EX13 battle through beta matchmaking and keeps normal opponents separate", async () => {
    vi.stubEnv("VITE_AEGIS_API_URL", server.endpoint);
    const { GameScreen } = await import("../src/game/GameScreen");
    const mainDeck = [...RED_DECK.mainDeck];
    mainDeck[0] = "EX13-007";
    render(
      <GameScreen
        joinOptions={{ displayName: "Beta protagonist", deck: { mainDeck, eggDeck: RED_DECK.eggDeck } }}
        identityColor="Red"
        startMode="beta"
        onExit={() => undefined}
      />,
    );
    await screen.findByText(/finding an opponent/i);
    const normal = await joinHeadlessOpponent(server.endpoint, { displayName: "Normal opponent", deck: BLUE_DECK });
    const beta = await joinHeadlessOpponent(server.endpoint, {
      displayName: "Beta opponent",
      deck: BLUE_DECK,
      betaBattleMode: true,
    });
    expect(normal.room.roomId).not.toBe(beta.room.roomId);
    beta.onDecision((request) => {
      if (request.kind === "mulligan") beta.mulligan(true);
    });
    beta.ready();
    fireEvent.click(await screen.findByRole("button", { name: /keep hand/i }, { timeout: 10_000 }));
    await screen.findByRole("img", { name: /^memory:/i }, { timeout: 10_000 });
    expect(beta.room.state.players).toHaveLength(2);
    const betaBotClient = new Client(server.endpoint);
    const betaBotRoom = await betaBotClient.create(ROOM_TYPE_BOT, {
      displayName: "Beta bot human",
      deck: { mainDeck, eggDeck: RED_DECK.eggDeck },
    });
    await vi.waitFor(() => expect(betaBotRoom.state.players).toHaveLength(1));
    await betaBotRoom.leave();
    await normal.leave();
    await beta.leave();
  }, 20_000);
});
