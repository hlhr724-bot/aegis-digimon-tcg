import { useCallback, useEffect, useState } from "react";

const MATCH_INTRO_SHOW_MS = 2400;
export const MATCH_INTRO_LEAVE_MS = 360;

const PLAYED_STORAGE_PREFIX = "aegis.matchIntro.played:";
const playedRoomIds = new Set<string>();

type MatchIntroPhase = "showing" | "leaving" | "done";

type MatchIntroRun = {
  roomId: string;
  phase: MatchIntroPhase;
};

type UseMatchIntroParams = {
  roomId: string | undefined;
  eligible: boolean;
  awaitingOpponent: boolean;
  matchStarting: boolean;
};

export type MatchIntro = {
  visible: boolean;
  leaving: boolean;
  skip: () => void;
};

export function useMatchIntro({ roomId, eligible, awaitingOpponent, matchStarting }: UseMatchIntroParams): MatchIntro {
  const [run, setRun] = useState<MatchIntroRun>();
  const [skipRequested, setSkipRequested] = useState(false);
  const currentRun = run && run.roomId === roomId ? run : undefined;
  const unplayed = !roomId || !hasPlayedMatchIntro(roomId);
  const startsNow = Boolean(eligible && roomId && matchStarting && !currentRun && unplayed);
  const holding = eligible && awaitingOpponent && !currentRun && unplayed;

  useEffect(() => {
    if (!startsNow || !roomId) {
      return;
    }
    markMatchIntroPlayed(roomId);
    setRun({ roomId, phase: skipRequested ? "leaving" : "showing" });
  }, [startsNow, roomId, skipRequested]);

  const runRoomId = currentRun?.roomId;
  const runPhase = currentRun?.phase;
  useEffect(() => {
    if (!runRoomId || !runPhase || runPhase === "done") {
      return;
    }
    const timer = window.setTimeout(
      () => setRun({ roomId: runRoomId, phase: runPhase === "showing" ? "leaving" : "done" }),
      runPhase === "showing" ? MATCH_INTRO_SHOW_MS : MATCH_INTRO_LEAVE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [runRoomId, runPhase]);

  const skip = useCallback(() => {
    setSkipRequested(true);
    setRun((previous) => (previous?.phase === "showing" ? { ...previous, phase: "leaving" } : previous));
  }, []);

  return {
    visible: holding || startsNow || (runPhase !== undefined && runPhase !== "done"),
    leaving: runPhase === "leaving",
    skip,
  };
}

function hasPlayedMatchIntro(roomId: string) {
  if (playedRoomIds.has(roomId)) {
    return true;
  }
  try {
    return window.sessionStorage.getItem(`${PLAYED_STORAGE_PREFIX}${roomId}`) !== null;
  } catch {
    return false;
  }
}

function markMatchIntroPlayed(roomId: string) {
  playedRoomIds.add(roomId);
  try {
    window.sessionStorage.setItem(`${PLAYED_STORAGE_PREFIX}${roomId}`, "1");
  } catch {
    return;
  }
}
