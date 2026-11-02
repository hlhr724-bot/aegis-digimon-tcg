// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { Phase, type GameState, type PlayerState } from "@aegis/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AegisRoom } from "../../../net/client";
import { intents } from "../../../net/intents";
import { setAutoHatchEnabled } from "../../autoHatch";
import { useAutoHatch } from "./useAutoHatch";

function options() {
  return {
    room: { roomId: "match-1" } as AegisRoom,
    state: { phase: Phase.Breeding, turnSeat: 0, turnCount: 1, gameOver: false } as GameState,
    viewer: { battleArea: [], eggDeckCount: 5 } as unknown as PlayerState,
    viewerSeat: 0 as const,
    ready: true,
    decisionOpen: false,
    presenting: false,
    phasePresentationPending: false,
  };
}

beforeEach(() => {
  setAutoHatchEnabled(false);
  vi.spyOn(intents, "hatchEgg").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("auto hatch", () => {
  it("stays manual by default and responds immediately to enabling the setting", () => {
    renderHook(() => useAutoHatch(options()));
    expect(intents.hatchEgg).not.toHaveBeenCalled();
    act(() => setAutoHatchEnabled(true));
    expect(intents.hatchEgg).toHaveBeenCalledTimes(1);
  });

  it("sends once despite StrictMode, rerenders, preference toggles, and transient locks", () => {
    setAutoHatchEnabled(true);
    const props = options();
    const { rerender } = renderHook(useAutoHatch, { initialProps: props, wrapper: StrictMode });
    rerender({ ...props });
    rerender({ ...props, presenting: true });
    rerender(props);
    act(() => setAutoHatchEnabled(false));
    act(() => setAutoHatchEnabled(true));
    expect(intents.hatchEgg).toHaveBeenCalledExactlyOnceWith(props.room);
    rerender({ ...props, state: { ...props.state, turnCount: 3 } as GameState });
    expect(intents.hatchEgg).toHaveBeenCalledTimes(2);
    rerender({ ...props, room: { roomId: "match-2" } as AegisRoom });
    expect(intents.hatchEgg).toHaveBeenCalledTimes(3);
  });

  it.each([
    { ready: false },
    { room: undefined },
    { state: undefined },
    { viewer: undefined },
    { viewerSeat: undefined },
    { decisionOpen: true },
    { presenting: true },
    { phasePresentationPending: true },
    { state: { ...options().state, phase: Phase.Main } as GameState },
    { state: { ...options().state, turnSeat: 1 } as GameState },
    { state: { ...options().state, gameOver: true } as GameState },
    { state: { ...options().state, combatWindow: {} } as GameState },
    { viewer: { ...options().viewer, eggDeckCount: 0 } as PlayerState },
  ])("waits when blocked: %j", (blocked) => {
    setAutoHatchEnabled(true);
    const props = options();
    const { rerender } = renderHook(useAutoHatch, { initialProps: { ...props, ...blocked } });
    expect(intents.hatchEgg).not.toHaveBeenCalled();
    rerender(props);
    expect(intents.hatchEgg).toHaveBeenCalledExactlyOnceWith(props.room);
  });

  it("does not hatch after the raising Digimon moves out during the same breeding step", () => {
    setAutoHatchEnabled(true);
    const props = options();
    const raising = { ...props.viewer, breeding: { permanentId: "agumon" } } as PlayerState;
    const { rerender } = renderHook(useAutoHatch, { initialProps: { ...props, viewer: raising } });
    rerender(props);
    expect(intents.hatchEgg).not.toHaveBeenCalled();
    rerender({ ...props, state: { ...props.state, turnCount: 3 } as GameState });
    expect(intents.hatchEgg).toHaveBeenCalledExactlyOnceWith(props.room);
  });
});
