// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMatchIntro } from "@/game/screen/hooks/useMatchIntro";

type IntroOptions = Parameters<typeof useMatchIntro>[0];

let roomSequence = 0;

function buildOptions(overrides: Partial<IntroOptions> = {}): IntroOptions {
  roomSequence += 1;
  return {
    roomId: `intro-room-${roomSequence}`,
    eligible: true,
    awaitingOpponent: false,
    matchStarting: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("match intro", () => {
  it("plays from the first render of a starting match, then leaves and finishes", () => {
    const options = buildOptions();
    const { result } = renderHook(() => useMatchIntro(options));
    expect(result.current.visible).toBe(true);
    expect(result.current.leaving).toBe(false);

    act(() => vi.advanceTimersByTime(2400));
    expect(result.current.visible).toBe(true);
    expect(result.current.leaving).toBe(true);

    act(() => vi.advanceTimersByTime(360));
    expect(result.current.visible).toBe(false);
  });

  it("leaves at once when skipped", () => {
    const options = buildOptions();
    const { result } = renderHook(() => useMatchIntro(options));
    act(() => result.current.skip());
    expect(result.current.leaving).toBe(true);

    act(() => vi.advanceTimersByTime(360));
    expect(result.current.visible).toBe(false);
  });

  it("does not replay for a room after a remount or a reconnect", () => {
    const options = buildOptions();
    const first = renderHook(() => useMatchIntro(options));
    act(() => vi.advanceTimersByTime(3000));
    first.unmount();

    const second = renderHook(() => useMatchIntro(options));
    expect(second.result.current.visible).toBe(false);
  });

  it("stays hidden for spectators, replays, and matches joined after the start", () => {
    const spectator = buildOptions({ eligible: false });
    const lateJoin = buildOptions({ matchStarting: false });
    expect(renderHook(() => useMatchIntro(spectator)).result.current.visible).toBe(false);
    expect(renderHook(() => useMatchIntro(lateJoin)).result.current.visible).toBe(false);
  });

  it("holds on screen while the bot takes its seat, then runs its full time", () => {
    const options = buildOptions({ awaitingOpponent: true, matchStarting: false });
    const { result, rerender } = renderHook((props: IntroOptions) => useMatchIntro(props), {
      initialProps: options,
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(true);

    rerender({ ...options, awaitingOpponent: false, matchStarting: true });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.leaving).toBe(false);

    act(() => vi.advanceTimersByTime(400));
    expect(result.current.leaving).toBe(true);

    act(() => vi.advanceTimersByTime(360));
    expect(result.current.visible).toBe(false);
  });
});
