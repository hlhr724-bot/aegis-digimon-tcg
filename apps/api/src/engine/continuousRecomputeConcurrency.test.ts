import { describe, expect, it, vi } from "vitest";
import { setupEngine } from "./testkit/harness.js";

describe("continuous recompute concurrency", () => {
  it("waits for an in-flight rebuild and performs one coalesced refresh", async () => {
    const s = setupEngine();
    await s.ready();

    const internals = s.engine as unknown as {
      runContinuousPass: (ask: unknown) => Promise<void>;
    };
    const runContinuousPass = internals.runContinuousPass.bind(s.engine);
    let passCount = 0;
    let releaseFirstPass: () => void = () => undefined;
    let markFirstPassEntered: () => void = () => undefined;
    const firstPassEntered = new Promise<void>((resolve) => {
      markFirstPassEntered = resolve;
    });
    const firstPassBlocked = new Promise<void>((resolve) => {
      releaseFirstPass = resolve;
    });

    internals.runContinuousPass = async (ask) => {
      passCount += 1;
      if (passCount === 1) {
        markFirstPassEntered();
        await firstPassBlocked;
      }
      await runContinuousPass(ask);
    };

    const first = s.engine.recomputeContinuousEffects();
    await firstPassEntered;
    let secondSettled = false;
    const second = s.engine.recomputeContinuousEffects().finally(() => {
      secondSettled = true;
    });

    try {
      await Promise.resolve();
      expect(secondSettled).toBe(false);
      releaseFirstPass();
      await Promise.all([first, second]);
      expect(passCount).toBe(2);
    } finally {
      releaseFirstPass();
      await Promise.allSettled([first, second]);
      internals.runContinuousPass = runContinuousPass;
    }
  });

  it("drains a rebuild queued while publishing play affordances", async () => {
    const s = setupEngine();
    await s.ready();
    let releasePublication: () => void = () => undefined;
    let markPublicationEntered: () => void = () => undefined;
    const publicationEntered = new Promise<void>((resolve) => {
      markPublicationEntered = resolve;
    });
    const publicationBlocked = new Promise<void>((resolve) => {
      releasePublication = resolve;
    });
    const pass = vi.spyOn(s.engine, "runContinuousPass");
    const publish = vi.spyOn(s.engine.projection, "syncNegamonPlayEffects").mockImplementationOnce(async () => {
      markPublicationEntered();
      await publicationBlocked;
    });
    const first = s.engine.recomputeContinuousEffects();
    await publicationEntered;
    const second = s.engine.recomputeContinuousEffects();
    try {
      expect(pass).toHaveBeenCalledTimes(1);
      releasePublication();
      await Promise.all([first, second]);
      expect(pass).toHaveBeenCalledTimes(2);
    } finally {
      releasePublication();
      await Promise.allSettled([first, second]);
      pass.mockRestore();
      publish.mockRestore();
    }
  });
});
