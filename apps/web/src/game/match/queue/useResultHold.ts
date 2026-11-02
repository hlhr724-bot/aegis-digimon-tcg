/* When the match result may take the screen.

   The server ends the match the moment the last blow lands, and the live state says so in
   the same patch. The queue is usually still playing what led there: the [When Attacking]
   chain the viewer just ordered, the security check, the deletion. The result waits for
   that playback, so the splash never covers effects that are still being shown.

   Only presentation waits. Legality, the match timer and intents keep reading the live
   state, which is already over, so nothing can be played during the hold.

   Two clocks bound the hold, because a beat that never finishes must never hide the result:
   - the stall clock, restarted by every queue change, catches a queue that stopped moving;
   - the ceiling caps the whole hold, however busy the queue looks.
   Either one fast-forwards what is left and shows the result. */

import { useEffect, useRef, useState } from "react";
import type { AnimationQueue } from "../../animationQueue";
import { activePacing } from "../../pacing";
import { PLAY_LEAD_IN_BUDGET_MS } from "../../timings";

/** How long the result waits on a queue that is making no progress at all (ms). */
export const RESULT_STALL_BUDGET_MS = PLAY_LEAD_IN_BUDGET_MS;

/** The longest the result may wait in total, healthy queue or not (ms). */
export function resultHoldCeilingMs(): number {
  return activePacing().budgetCeilingMs;
}

export function useResultHold({
  gameOver,
  gameOverPresented,
  playbackPending,
  lastClauseAt,
  queueActivity,
  queue,
}: {
  /** The live state: the server has ended the match. */
  gameOver: boolean;
  /** The batch that carries the `gameOver` event has reached the presentation. */
  gameOverPresented: boolean;
  /** Finite beats are still queued or playing. */
  playbackPending: boolean;
  /**
   * When the newest clause on screen appeared (`Date.now()` ms). Clauses are read outside
   * the queue, so the last one finishes its step the moment it appears.
   */
  lastClauseAt: number | undefined;
  /** Bumped by every queue change; the heartbeat the stall clock waits on. */
  queueActivity: number;
  queue: Pick<AnimationQueue, "skip" | "getMode" | "isPaused">;
}): boolean {
  // A match that was already over when this screen joined it (a reconnect, a late
  // spectator) has nothing of its ending left to play.
  const sawRunningMatchRef = useRef(!gameOver);
  if (!gameOver) sawRunningMatchRef.current = true;
  const [released, setReleased] = useState(false);
  const [readClauseAt, setReadClauseAt] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!gameOver) setReleased(false);
  }, [gameOver]);

  const readUntil = lastClauseAt === undefined ? undefined : lastClauseAt + activePacing().clauseReadableMs;
  const clauseUnread = lastClauseAt !== undefined && readClauseAt !== lastClauseAt;
  useEffect(() => {
    if (!gameOver || lastClauseAt === undefined || readUntil === undefined) return;
    const timer = setTimeout(() => setReadClauseAt(lastClauseAt), Math.max(0, readUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [gameOver, lastClauseAt, readUntil]);

  const holding =
    gameOver &&
    sawRunningMatchRef.current &&
    !released &&
    queue.getMode() === "live" &&
    (playbackPending || !gameOverPresented || clauseUnread);

  const releasedRef = useRef(false);
  releasedRef.current = released;
  function release() {
    if (releasedRef.current) return;
    releasedRef.current = true;
    queue.skip();
    setReleased(true);
  }

  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => {
      if (!queue.isPaused()) release();
    }, resultHoldCeilingMs());
    return () => clearTimeout(timer);
    // The ceiling starts once, when the hold does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding]);

  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => {
      // A paused presentation (the dev arena's pause) is not a stalled one.
      if (!queue.isPaused()) release();
    }, RESULT_STALL_BUDGET_MS);
    return () => clearTimeout(timer);
    // `queueActivity` is the heartbeat this effect waits on, not a value it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding, queueActivity]);

  return holding;
}
