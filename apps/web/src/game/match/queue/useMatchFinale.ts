import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { AnimationQueue, AnimationStepContext } from "@/game/animationQueue";
import { CueTrack } from "@/game/match/enums";
import { findLethalBlow } from "@/game/match/finale/findLethalBlow";
import type { MatchFinale } from "@/game/match/finale/MatchFinale";
import { isFinitePlaybackStep } from "@/game/match/queue/isFinitePlaybackStep";
import { waitForPaintedAnimation } from "@/game/paintedAnimationClock";
import { FINALE_TOTAL_MS } from "@/game/timings";
import type { ServerBatch } from "@/net/serverBatches";

type Params = {
  batches: readonly ServerBatch[];
  gameOver: boolean;
  queue: AnimationQueue;
  board: RefObject<HTMLElement | null>;
};

type EarlierPlaybackParams = {
  queue: AnimationQueue;
  stepId: string;
  context: AnimationStepContext;
};

const FINALE_CLOCK_NAME = "battle-finale-clock";

function isLive(context: AnimationStepContext): boolean {
  return context.mode === "live" && !context.cancelled && !context.skipping;
}

async function waitForEarlierPlayback({ queue, stepId, context }: EarlierPlaybackParams) {
  while (isLive(context) && queue.hasPendingStep((step) => step.id !== stepId && isFinitePlaybackStep(step))) {
    await context.wait(16);
  }
}

export function useMatchFinale({ batches, gameOver, queue, board }: Params): MatchFinale | null {
  const sawRunningMatch = useRef(!gameOver);
  if (!gameOver) {
    sawRunningMatch.current = true;
  }
  const startedKey = useRef<string | undefined>(undefined);
  const [finale, setFinale] = useState<MatchFinale | null>(null);

  useEffect(() => {
    if (!gameOver) {
      setFinale(null);
    }
  }, [gameOver]);

  useLayoutEffect(() => {
    if (!gameOver || !sawRunningMatch.current) {
      return;
    }
    const blow = findLethalBlow({ batches });
    if (!blow || startedKey.current === blow.key) {
      return;
    }
    startedKey.current = blow.key;
    const stepId = `match-finale-${blow.key}`;
    queue.enqueue({
      id: stepId,
      track: CueTrack.Finale,
      holdsBoard: false,
      async run(context) {
        if (context.mode !== "live") {
          setFinale(blow);
          return;
        }
        await waitForEarlierPlayback({ queue, stepId, context });
        if (!isLive(context)) {
          return;
        }
        setFinale(blow);
        await context.wait(FINALE_TOTAL_MS);
        await waitForPaintedAnimation(
          () => board.current?.querySelector(`[data-finale-key="${CSS.escape(blow.key)}"]`),
          FINALE_CLOCK_NAME,
          FINALE_TOTAL_MS,
          context,
        );
      },
    });
  }, [batches, gameOver, queue, board]);

  return finale;
}
