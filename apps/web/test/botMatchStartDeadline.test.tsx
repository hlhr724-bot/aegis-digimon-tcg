// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { act, cleanup, render, screen } from "./scenarioHarness/testingLibrary";
import { GameScreen } from "../src/game/GameScreen";
import { clientErrorReporter } from "../src/clientErrors/clientErrorReporter";

const mocked = vi.hoisted(() => ({
  roomResult: { current: undefined as unknown },
}));

vi.mock("../src/net/useRoom", () => ({
  useRoom: () => mocked.roomResult.current,
}));

vi.mock("../src/net/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/net/client")>()),
  joinWithBot: () => new Promise<void>(() => {}),
}));

const BOT_START_DEADLINE_MS = 20_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(clientErrorReporter, "capture").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function botScreen(): ReactElement {
  return (
    <GameScreen
      joinOptions={{ displayName: "Protagonist", deck: { mainDeck: [], eggDeck: [] } }}
      identityColor="Red"
      startMode="bot"
      onExit={() => {}}
    />
  );
}

function pendingConnection(status: string, room?: { roomId: string; onMessage: () => () => void; send: () => void }) {
  return {
    room,
    status,
    state: undefined,
    events: [],
    sessionId: room ? "viewer-session" : undefined,
    roomCode: "",
    rollbackCount: 0,
    snapshots: [],
  };
}

it("offers a way back to the lobby when the bot room never finishes connecting", () => {
  mocked.roomResult.current = pendingConnection("connecting");
  render(botScreen());
  expect(screen.getByText("Connecting bot opponent…")).toBeTruthy();

  act(() => vi.advanceTimersByTime(BOT_START_DEADLINE_MS - 1));
  expect(screen.queryByText("Could not connect the bot")).toBeNull();

  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText("Could not connect the bot")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Return to lobby" })).toBeTruthy();
  expect(clientErrorReporter.capture).toHaveBeenCalledOnce();
});

it("offers a way back to the lobby when the connected room never seats the bot", () => {
  mocked.roomResult.current = pendingConnection("connected", {
    roomId: "bot-room",
    onMessage: () => () => {},
    send: () => {},
  });
  render(botScreen());

  act(() => vi.advanceTimersByTime(BOT_START_DEADLINE_MS));
  expect(screen.getByText("Could not connect the bot")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Return to lobby" })).toBeTruthy();
});

it("keeps waiting while a dropped bot match is reconnecting", () => {
  mocked.roomResult.current = pendingConnection("reconnecting");
  render(botScreen());

  act(() => vi.advanceTimersByTime(BOT_START_DEADLINE_MS * 2));
  expect(screen.queryByText("Could not connect the bot")).toBeNull();
});
