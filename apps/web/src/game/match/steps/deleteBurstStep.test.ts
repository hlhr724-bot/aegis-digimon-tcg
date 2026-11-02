import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAnimationQueue } from "../../animationQueue";
import { createPresentationGate } from "../presentationGate";
import { deleteBurstStep } from "./deleteBurstStep";
import type { DeleteBurst } from "../types";
import type { DeletionReadyAt } from "../presentationGate";
import { holdsTheBoard } from "../tracks";
import { TIMINGS } from "../../timings";
import { joinRemovalChain, type RemovalLink } from "@/game/match/removalChain";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("measures the held face at departure, releases the shatter at 250ms and keeps only non-blocking light", async () => {
  const queue = createAnimationQueue();
  const gate = createPresentationGate();
  const release = vi.fn<() => void>();
  let bursts: readonly DeleteBurst[] = [];
  const ready = { current: new Map<string, DeletionReadyAt>() };
  const face = vi.fn<() => { x: number; y: number; width: number; height: number; angle: number }>(() => ({
    x: 200,
    y: 300,
    width: 116,
    height: 162,
    angle: 90,
  }));
  const step = deleteBurstStep({
    queue,
    key: 1,
    anchors: {
      permanentCenter: () => ({ x: 100, y: 100 }),
      permanentFace: face,
      board: { current: null },
      yourDeck: { current: null },
      oppDeck: { current: null },
      yourHandDock: { current: null },
      oppHandStrip: { current: null },
      yourSecurity: { current: null },
      oppSecurity: { current: null },
    },
    anchorId: "target",
    metadataCardId: "BT1-020",
    effectDeletion: true,
    deletionReadyAtRef: ready,
    metadataSeat: 0,
    securityBlowRef: { current: null },
    causingEffectGate: gate,
    readBeforeBreak: false,
    releaseHeldDeletion: release,
    setDeleteBursts: (update) => {
      bursts = typeof update === "function" ? update(bursts) : update;
    },
  })!;
  queue.enqueue(step);
  await vi.advanceTimersByTimeAsync(0);
  expect(bursts).toHaveLength(0);
  expect(release).not.toHaveBeenCalled();
  expect(face).not.toHaveBeenCalled();
  gate.release();
  await vi.advanceTimersByTimeAsync(0);
  expect(face).toHaveBeenCalledOnce();
  expect(bursts[0]).toMatchObject({ x: 142, y: 219, face: { width: 116, height: 162, angle: 90 } });
  await vi.advanceTimersByTimeAsync(249);
  const arrival = ready.current.get("0:BT1-020") as DeletionReadyAt;
  expect(arrival.shattered!.open).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(arrival.shattered!.open).toBe(true);
  expect(queue.hasPendingStep(holdsTheBoard)).toBe(false);
  expect(bursts).toHaveLength(1);
  expect(release).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(TIMINGS.cardBurst - TIMINGS.deletionBurst);
  expect(bursts).toHaveLength(0);
  expect(queue.isIdle()).toBe(true);
});

it.each(["discard", "cancel-shards", "skip-shards", "cancel-light", "skip-light"])(
  "%s releases the physical card, gates and any remaining decoration",
  async (caseName) => {
    const queue = createAnimationQueue();
    if (caseName === "discard") queue.pause();
    const ready = { current: new Map<string, DeletionReadyAt>() };
    const release = vi.fn<() => void>();
    let bursts: readonly DeleteBurst[] = [];
    const step = deleteBurstStep({
      queue,
      key: 8,
      anchorId: "target",
      metadataCardId: "BT1-020",
      metadataSeat: 0,
      anchors: {
        permanentCenter: () => ({ x: 80, y: 90 }),
        board: { current: null },
        yourDeck: { current: null },
        oppDeck: { current: null },
        yourHandDock: { current: null },
        oppHandStrip: { current: null },
        yourSecurity: { current: null },
        oppSecurity: { current: null },
      },
      deletionReadyAtRef: ready,
      securityBlowRef: { current: null },
      causingEffectGate: null,
      releaseHeldDeletion: release,
      setDeleteBursts: (update) => {
        bursts = typeof update === "function" ? update(bursts) : update;
      },
    })!;
    queue.enqueue(step);
    await vi.advanceTimersByTimeAsync(caseName.includes("light") ? 300 : 0);
    if (caseName.startsWith("skip")) queue.skip();
    else queue.clear();
    await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledOnce();
    expect(ready.current.get("0:BT1-020")!.started!.open).toBe(true);
    expect(ready.current.get("0:BT1-020")!.shattered!.open).toBe(true);
    expect(bursts).toHaveLength(0);
    expect(queue.isIdle()).toBe(true);
  },
);

it("keeps tied opponent deletions on their own faces while preserving the stagger and shatter gates", async () => {
  const queue = createAnimationQueue();
  const chain: { current: RemovalLink | null } = { current: null };
  const ready = { current: new Map<string, DeletionReadyAt>() };
  const releases = [vi.fn<() => void>(), vi.fn<() => void>()];
  const arrivals: DeletionReadyAt[] = [];
  let bursts: readonly DeleteBurst[] = [];
  for (const key of [1, 2]) {
    const step = deleteBurstStep({
      queue,
      key,
      anchorId: `opponent-${key}`,
      metadataCardId: "BT1-009",
      metadataSeat: 1,
      metadataInstanceId: `opponent-card-${key}`,
      effectDeletion: true,
      removal: joinRemovalChain(chain),
      anchors: {
        permanentCenter: () => ({ x: key * 150, y: 80 }),
        permanentFace: () => ({ x: key * 150, y: 80, width: 100, height: 140, angle: 180 }),
        board: { current: null },
        yourDeck: { current: null },
        oppDeck: { current: null },
        yourHandDock: { current: null },
        oppHandStrip: { current: null },
        yourSecurity: { current: null },
        oppSecurity: { current: null },
      },
      deletionReadyAtRef: ready,
      securityBlowRef: { current: null },
      causingEffectGate: null,
      releaseHeldDeletion: releases[key - 1]!,
      setDeleteBursts: (update) => {
        bursts = typeof update === "function" ? update(bursts) : update;
      },
    })!;
    arrivals.push(ready.current.get("1:BT1-009")!);
    queue.enqueue(step);
  }
  await vi.advanceTimersByTimeAsync(0);
  expect(bursts).toMatchObject([{ key: 1, x: 100, y: 10, face: { angle: 180 } }]);
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(releases[1]).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(TIMINGS.deletionBurst - 1);
  expect(arrivals[0]!.shattered!.open).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(arrivals[0]!.shattered!.open).toBe(true);
  expect(arrivals[1]!.started!.open).toBe(false);
  await vi.advanceTimersByTimeAsync(TIMINGS.removalStagger - TIMINGS.deletionBurst);
  expect(bursts).toMatchObject([
    { key: 1, x: 100 },
    { key: 2, x: 250, y: 10, face: { angle: 180 } },
  ]);
  expect(releases[1]).toHaveBeenCalledOnce();
  expect(arrivals[1]!.started!.open).toBe(true);
  await vi.advanceTimersByTimeAsync(TIMINGS.deletionBurst);
  expect(arrivals[1]!.shattered!.open).toBe(true);
  expect(queue.hasPendingStep(holdsTheBoard)).toBe(false);
  await vi.runAllTimersAsync();
  expect(bursts).toHaveLength(0);
  expect(queue.isIdle()).toBe(true);
});
