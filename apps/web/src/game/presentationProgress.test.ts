import { describe, expect, it, vi } from "vitest";
import { createPresentationProgress } from "./presentationProgress";
import type { AnimationStep } from "./animationQueue";
import { CardInstance, GameState, PlayerState } from "@aegis/shared";
import { selectPresentedState, snapshotGameState } from "../net/presentedState";

/** A step that runs until it is let go, the way a step holding a moment on screen does. */
const step = (id: string): AnimationStep => ({ id, run: (context) => context.wait(1) });

/** Runs a tracked step the way the queue does, and returns the handle that ends it. */
function runTracked(tracked: AnimationStep): () => void {
  let finish = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  void tracked.run({ wait: () => done, cancelled: false, mode: "live", skipping: false });
  return finish;
}

describe("createPresentationProgress", () => {
  it("reports nothing while no batch is being presented", () => {
    const progress = createPresentationProgress(vi.fn<() => void>());

    const loose = step("loose");
    expect(progress.current()).toBeUndefined();
    expect(progress.track(loose)).toBe(loose);
  });

  it("reports the revision of the oldest batch that still has a step to run", async () => {
    const onChange = vi.fn<() => void>();
    const progress = createPresentationProgress(onChange);

    progress.present("batch-1", 1);
    const first = runTracked(progress.track(step("first")));
    expect(progress.current()).toBe(1);
    expect(onChange).toHaveBeenCalled();

    // A later batch's cue can already be running; the board stays on the older moment.
    progress.present("batch-2", 2);
    const second = runTracked(progress.track(step("second")));
    expect(progress.current()).toBe(1);

    first();
    await vi.waitFor(() => expect(progress.current()).toBe(2));

    second();
    await vi.waitFor(() => expect(progress.current()).toBeUndefined());
  });

  it("keeps a later batch's result off the board while a ribbon holds an earlier revision", async () => {
    const progress = createPresentationProgress(vi.fn<() => void>());

    const releaseRibbon = progress.hold(124);
    progress.present("bot-play", 126);
    const showcase = runTracked(progress.track(step("showcase")));
    expect(progress.current()).toBe(124);

    releaseRibbon();
    expect(progress.current()).toBe(126);
    releaseRibbon();
    expect(progress.current()).toBe(126);

    showcase();
    await vi.waitFor(() => expect(progress.current()).toBeUndefined());
  });

  it("drops ribbon holds when it settles", () => {
    const progress = createPresentationProgress(vi.fn<() => void>());

    progress.hold(3);
    expect(progress.current()).toBe(3);

    progress.settle();
    expect(progress.current()).toBeUndefined();
  });

  it("reports nothing once it has settled, whatever became of the steps", () => {
    const progress = createPresentationProgress(vi.fn<() => void>());

    progress.present("batch-1", 1);
    progress.track(step("dropped-before-it-ran"));
    expect(progress.current()).toBe(1);

    progress.settle();
    expect(progress.current()).toBeUndefined();
  });

  it("never reports a revision older than the floor", () => {
    const progress = createPresentationProgress(vi.fn<() => void>());

    progress.present("batch-1", 1);
    runTracked(progress.track(step("first")));
    progress.raiseFloor(2);

    expect(progress.current()).toBe(2);
  });

  it("keeps a decision floor on its exact snapshot while later accepted results remain queued", async () => {
    const progress = createPresentationProgress(vi.fn<() => void>());
    const live = new GameState();
    live.stateVersion = 2;
    live.players.push(new PlayerState(), new PlayerState());
    const decisionBoard = snapshotGameState(live);
    const laterDraw = new CardInstance();
    laterDraw.instanceId = "later-effect-draw";
    laterDraw.cardId = "ST1-07";
    live.players[0]!.hand.push(laterDraw);
    live.players[0]!.handCount = 1;
    live.stateVersion = 5;
    const futureBoard = snapshotGameState(live);
    const snapshots = [
      { stateVersion: 2, state: decisionBoard },
      { stateVersion: 5, state: futureBoard },
    ];
    const shown = () => selectPresentedState({ live, snapshots, presentedStateVersion: progress.current() })!;

    progress.present("earlier-clause", 1);
    const earlier = runTracked(progress.track(step("earlier-reading")));
    progress.present("later-effect", 5);
    const later = runTracked(progress.track(step("later-result")));
    progress.raiseFloor(2);
    expect(progress.current()).toBe(2);
    expect(shown().stateVersion).toBe(2);
    expect(shown().players[0]!.hand).toEqual([]);

    earlier();
    await vi.waitFor(() => expect(progress.current()).toBe(5));
    expect(shown().players[0]!.hand.map((card) => card.instanceId)).toEqual([laterDraw.instanceId]);
    later();
    await vi.waitFor(() => expect(progress.current()).toBeUndefined());
    expect(shown()).toBe(live);
  });
});
