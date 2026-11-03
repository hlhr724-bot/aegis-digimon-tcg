// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Arena3dFallbackReason } from "@/game/arena3d/fallback/Arena3dFallbackReason";
import { Arena3dSceneStatus } from "@/game/arena3d/fallback/Arena3dSceneStatus";
import {
  ARENA_3D_RESTART_DELAY_MILLISECONDS,
  MAX_ARENA_3D_RESTARTS,
  useArena3dSceneRecovery,
} from "@/game/arena3d/fallback/useArena3dSceneRecovery";

const reportArena3dFallback = vi.hoisted(() => vi.fn<(reason: string) => void>());

vi.mock("@/game/arena3d/fallback/reportArena3dFallback", () => ({ reportArena3dFallback }));

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

function loseContextAndRestart(view: { result: { current: ReturnType<typeof useArena3dSceneRecovery> } }) {
  act(() => view.result.current.handleContextLost());
  act(() => vi.advanceTimersByTime(ARENA_3D_RESTART_DELAY_MILLISECONDS));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  reportArena3dFallback.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("3D scene recovery", () => {
  it("restarts the scene with a fresh key after the browser drops the graphics context", () => {
    const view = renderHook(() => useArena3dSceneRecovery());
    act(() => view.result.current.handleContextLost());
    expect(view.result.current.status).toBe(Arena3dSceneStatus.RESTARTING.value);
    expect(reportArena3dFallback).toHaveBeenCalledWith(Arena3dFallbackReason.CONTEXT_LOST.value);

    act(() => vi.advanceTimersByTime(ARENA_3D_RESTART_DELAY_MILLISECONDS));
    expect(view.result.current.status).toBe(Arena3dSceneStatus.RUNNING.value);
    expect(view.result.current.sceneKey).toBe(1);
  });

  it("waits until the page is visible again before restarting", () => {
    visibility = "hidden";
    const view = renderHook(() => useArena3dSceneRecovery());
    act(() => view.result.current.handleContextLost());
    act(() => vi.advanceTimersByTime(ARENA_3D_RESTART_DELAY_MILLISECONDS * 10));
    expect(view.result.current.status).toBe(Arena3dSceneStatus.RESTARTING.value);

    act(() => setVisibility("visible"));
    act(() => vi.advanceTimersByTime(ARENA_3D_RESTART_DELAY_MILLISECONDS));
    expect(view.result.current.status).toBe(Arena3dSceneStatus.RUNNING.value);
  });

  it("stops after the restart limit and reports that the restarts failed", () => {
    const view = renderHook(() => useArena3dSceneRecovery());
    for (let restart = 0; restart < MAX_ARENA_3D_RESTARTS; restart += 1) {
      loseContextAndRestart(view);
    }
    act(() => view.result.current.handleContextLost());
    expect(view.result.current.status).toBe(Arena3dSceneStatus.STOPPED.value);
    expect(reportArena3dFallback).toHaveBeenCalledWith(Arena3dFallbackReason.RESTART_FAILED.value);
  });

  it("stops on a scene crash and starts again when the player retries", () => {
    const view = renderHook(() => useArena3dSceneRecovery());
    act(() => view.result.current.handleCrash());
    expect(view.result.current.status).toBe(Arena3dSceneStatus.STOPPED.value);
    expect(reportArena3dFallback).toHaveBeenCalledWith(Arena3dFallbackReason.SCENE_CRASHED.value);

    act(() => view.result.current.retry());
    expect(view.result.current.status).toBe(Arena3dSceneStatus.RUNNING.value);
    expect(view.result.current.sceneKey).toBe(1);
  });
});
