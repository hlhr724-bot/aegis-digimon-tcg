// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { createAnimationQueue, type AnimationQueue, type AnimationQueueMode } from "@/game/animationQueue";
import { useMatchFinale } from "@/game/match/queue/useMatchFinale";
import { FINALE_TOTAL_MS } from "@/game/timings";
import type { ServerBatch } from "@/net/serverBatches";

type Props = Parameters<typeof useMatchFinale>[0];

type RunningParams = {
  queue: AnimationQueue;
  batches?: readonly ServerBatch[];
  gameOver?: boolean;
};

function buildBatch(id: string, events: readonly ServerEvent[]): ServerBatch {
  return {
    id,
    stateVersion: 1,
    events: events.map((event, seq) => ({ ...event, seq, batch: id, stateVersion: 1 })),
  };
}

const LETHAL_BATCH = buildBatch("lethal", [
  {
    kind: "attackDeclared",
    seat: 0,
    attackerPermanentId: "attacker",
    attackerCardId: "BT1-010",
    target: { kind: "player" },
  },
  { kind: "gameOver", result: { outcome: "win", winnerSeat: 0 }, reason: "security" },
]);

function buildProps({ queue, batches = [], gameOver = false }: RunningParams): Props {
  return { batches, gameOver, queue, board: { current: document.createElement("div") } };
}

function createQueue(mode: AnimationQueueMode = "live"): AnimationQueue {
  return createAnimationQueue({ mode });
}

function hasFinaleStep(queue: AnimationQueue): boolean {
  return queue.hasPendingStep((step) => step.id.startsWith("match-finale-"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useMatchFinale", () => {
  it("plays the finale on the queue for its whole clock, so the result waits for it", async () => {
    const queue = createQueue();
    const hook = renderHook((props: Props) => useMatchFinale(props), { initialProps: buildProps({ queue }) });

    hook.rerender(buildProps({ queue, batches: [LETHAL_BATCH], gameOver: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });

    expect(hook.result.current).toMatchObject({ key: "lethal", winnerSeat: 0, attacker: { permanentId: "attacker" } });
    expect(hasFinaleStep(queue)).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FINALE_TOTAL_MS);
    });

    expect(hasFinaleStep(queue)).toBe(false);
  });

  it("starts only after the beats that led to the blow have played", async () => {
    const queue = createQueue();
    const hook = renderHook((props: Props) => useMatchFinale(props), { initialProps: buildProps({ queue }) });
    queue.enqueue({ id: "attack-arrow", track: "attack", run: (context) => context.wait(500) });

    hook.rerender(buildProps({ queue, batches: [LETHAL_BATCH], gameOver: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(hook.result.current).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(hook.result.current?.key).toBe("lethal");
  });

  it("lets a skip cut the finale short", async () => {
    const queue = createQueue();
    const hook = renderHook((props: Props) => useMatchFinale(props), { initialProps: buildProps({ queue }) });

    hook.rerender(buildProps({ queue, batches: [LETHAL_BATCH], gameOver: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => queue.skip());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(hasFinaleStep(queue)).toBe(false);
  });

  it("shows the calm finale without holding a drained queue", async () => {
    const queue = createQueue("drain");
    const hook = renderHook((props: Props) => useMatchFinale(props), { initialProps: buildProps({ queue }) });

    hook.rerender(buildProps({ queue, batches: [LETHAL_BATCH], gameOver: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(hook.result.current?.key).toBe("lethal");
    expect(hasFinaleStep(queue)).toBe(false);
  });

  it("plays nothing for a match that was already over when the screen joined it", async () => {
    const queue = createQueue();
    const hook = renderHook((props: Props) => useMatchFinale(props), {
      initialProps: buildProps({ queue, batches: [LETHAL_BATCH], gameOver: true }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });

    expect(hook.result.current).toBeNull();
    expect(hasFinaleStep(queue)).toBe(false);
  });
});
