import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GameState, PlayerState, type MatchReplay } from "@aegis/shared";
import { I18nProvider } from "@/i18n";
import { ReplayPlayer } from "@/replays/ReplayPlayer";
import { validateReplay } from "@/replays/validation";
import type { PresentationProbe } from "@/game/presentationProbe";

const playback = vi.hoisted(() => ({ idle: true }));
vi.mock("../game/GameScreen", () => ({
  GameScreen: ({ devProbe, demoConnection }: { devProbe: PresentationProbe; demoConnection: { state: GameState } }) => {
    useEffect(() => {
      playback.idle = !demoConnection.state.gameOver;
      devProbe.onQueue?.({
        queue: {
          isIdle: () => playback.idle,
          setRate: vi.fn<(rate: number) => void>(),
          resume: vi.fn<() => void>(),
          pause: vi.fn<() => void>(),
        },
      } as unknown as Parameters<NonNullable<PresentationProbe["onQueue"]>>[0]);
    }, [devProbe, demoConnection.state]);
    return <div>Replay board</div>;
  },
}));
vi.mock("./ReplayRecording", () => ({
  ReplayRecording: ({ finished }: { finished: boolean }) => (
    <output data-testid="recording-finished">{String(finished)}</output>
  ),
}));

function buildReplay(): MatchReplay {
  const state = new GameState();
  for (const seat of [0, 1] as const) {
    state.players.push(Object.assign(new PlayerState(), { seat, displayName: `Player ${seat}` }));
  }
  state.stateVersion = 1;
  const first = state.toJSON() as unknown as GameState;
  state.stateVersion = 2;
  state.gameOver = true;
  state.winnerSeat = 0;
  return {
    id: "ending",
    mode: "casual",
    players: ["Player 0", "Player 1"],
    startedAt: 0,
    finishedAt: 10_000,
    winnerSeat: 0,
    frameCount: 2,
    format: "aegis-replay",
    version: 1,
    viewerSeat: 0,
    visibleHandSeats: [0, 1],
    frames: [
      { atMs: 0, state: first, events: [] },
      {
        atMs: 1000,
        state: state.toJSON() as unknown as GameState,
        events: [
          {
            kind: "gameOver",
            result: { outcome: "win", winnerSeat: 0 },
            reason: "surrender",
            seq: 1,
            batch: "end",
            stateVersion: 2,
          },
        ],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows the result only after final animations settle and holds it for two real seconds before stopping recording", () => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: () => [] });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(
    <I18nProvider>
      <ReplayPlayer replay={buildReplay()} onClose={vi.fn<() => void>()} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByText("Victory")).toBeNull();
  expect(screen.getByTestId("recording-finished").textContent).toBe("false");
  act(() => {
    playback.idle = true;
    vi.advanceTimersByTime(50);
  });
  expect(screen.getByText("Victory")).toBeTruthy();
  expect(screen.getByText("Your opponent surrendered.")).toBeTruthy();
  act(() => vi.advanceTimersByTime(1999));
  expect(screen.getByTestId("recording-finished").textContent).toBe("false");
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByTestId("recording-finished").textContent).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Go to start" }));
  expect(screen.getByTestId("recording-finished").textContent).toBe("false");
  expect(screen.queryByText("Victory")).toBeNull();
});

it("accepts legacy replays and bounded optional deck snapshots but rejects malformed metadata", () => {
  const legacy = buildReplay();
  expect(validateReplay(legacy)).toBe(true);
  const replay = {
    ...legacy,
    decks: [{ deckName: "Starter", mainDeck: ["BT1-010"], eggDeck: [] }, null],
    deckIcons: ["BT1-010", null],
  };
  expect(validateReplay(replay)).toBe(true);
  expect(validateReplay({ ...replay, decks: [replay.decks[0]] })).toBe(false);
  expect(validateReplay({ ...replay, deckIcons: ["BT1-010", "PRIVATE"] })).toBe(false);
  expect(
    validateReplay({ ...replay, decks: [{ ...replay.decks[0], mainDeck: Array(101).fill("BT1-010") }, null] }),
  ).toBe(false);
});

it("waits for final animations when stepping to the last action while paused", () => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: () => [] });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(
    <I18nProvider>
      <ReplayPlayer replay={buildReplay()} onClose={vi.fn<() => void>()} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Next action" }));
  expect(screen.queryByText("Victory")).toBeNull();
  act(() => {
    playback.idle = true;
    vi.advanceTimersByTime(50);
  });
  expect(screen.getByText("Victory")).toBeTruthy();
  expect(screen.getByTestId("recording-finished").textContent).toBe("false");
});
