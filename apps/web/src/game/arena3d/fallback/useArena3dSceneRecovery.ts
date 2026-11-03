import { useCallback, useEffect, useState } from "react";
import { Arena3dFallbackReason } from "@/game/arena3d/fallback/Arena3dFallbackReason";
import { Arena3dSceneStatus } from "@/game/arena3d/fallback/Arena3dSceneStatus";
import { reportArena3dFallback } from "@/game/arena3d/fallback/reportArena3dFallback";

export const MAX_ARENA_3D_RESTARTS = 3;
export const ARENA_3D_RESTART_DELAY_MILLISECONDS = 800;

type Recovery = {
  status: Arena3dSceneStatus;
  sceneKey: number;
  handleContextLost: () => void;
  handleCrash: () => void;
  retry: () => void;
};

type RecoveryState = {
  status: Arena3dSceneStatus;
  sceneKey: number;
  restarts: number;
  reason?: Arena3dFallbackReason;
};

const INITIAL_STATE: RecoveryState = { status: Arena3dSceneStatus.RUNNING.value, sceneKey: 0, restarts: 0 };

function isPageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function useArena3dSceneRecovery(): Recovery {
  const [state, setState] = useState<RecoveryState>(INITIAL_STATE);

  const handleContextLost = useCallback(() => {
    setState((current) => {
      if (current.status !== Arena3dSceneStatus.RUNNING.value) {
        return current;
      }
      if (current.restarts >= MAX_ARENA_3D_RESTARTS) {
        return {
          ...current,
          status: Arena3dSceneStatus.STOPPED.value,
          reason: Arena3dFallbackReason.RESTART_FAILED.value,
        };
      }
      return {
        ...current,
        status: Arena3dSceneStatus.RESTARTING.value,
        reason: Arena3dFallbackReason.CONTEXT_LOST.value,
      };
    });
  }, []);

  const handleCrash = useCallback(() => {
    setState((current) => ({
      ...current,
      status: Arena3dSceneStatus.STOPPED.value,
      reason: Arena3dFallbackReason.SCENE_CRASHED.value,
    }));
  }, []);

  const retry = useCallback(() => {
    setState((current) => ({ status: Arena3dSceneStatus.RUNNING.value, sceneKey: current.sceneKey + 1, restarts: 0 }));
  }, []);

  useEffect(() => {
    if (state.status !== Arena3dSceneStatus.RUNNING.value && state.reason) {
      reportArena3dFallback(state.reason);
    }
  }, [state.status, state.reason]);

  useEffect(() => {
    if (state.status !== Arena3dSceneStatus.RESTARTING.value) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restart = () =>
      setState((current) =>
        current.status === Arena3dSceneStatus.RESTARTING.value
          ? { status: Arena3dSceneStatus.RUNNING.value, sceneKey: current.sceneKey + 1, restarts: current.restarts + 1 }
          : current,
      );
    const scheduleWhenVisible = () => {
      if (timer !== undefined || !isPageVisible()) {
        return;
      }
      timer = setTimeout(restart, ARENA_3D_RESTART_DELAY_MILLISECONDS);
    };
    scheduleWhenVisible();
    document.addEventListener("visibilitychange", scheduleWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", scheduleWhenVisible);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [state.status]);

  return { status: state.status, sceneKey: state.sceneKey, handleContextLost, handleCrash, retry };
}
