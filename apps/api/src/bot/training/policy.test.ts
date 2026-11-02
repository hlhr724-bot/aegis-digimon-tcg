import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared";
import { setupEngine } from "../../engine/testkit/harness.js";
import { buildBotView } from "../view.js";
import { createTrainingPolicy, createAsyncTrainingPolicy, type TrainingWindow } from "./policy.js";

describe("training combat context", () => {
  it("preserves target kind and compulsory block while retaining all legal blockers", async () => {
    const setup = setupEngine({});
    await setup.ready();
    const windows: TrainingWindow[] = [];
    const policy = createTrainingPolicy(setup.engine, 0, (window) => {
      windows.push(window);
      return 0;
    });
    const context = {
      attackerPermanentId: "attacker",
      eligibleBlockerIds: ["A", "B"],
      mustBlock: false,
      targetsPlayer: true,
    };
    const view = buildBotView(setup.state, 0)!;
    expect(policy.chooseBlockResponse(view, context)).toEqual({ type: "declineBlock" });
    expect(windows[0]!.combat).toEqual({ targetsPlayer: true, mustBlock: false });
    expect(windows[0]!.actions).toHaveLength(3);
    policy.chooseBlockResponse(view, {
      ...context,
      targetsPlayer: false,
      targetPermanentId: "defender",
      mustBlock: true,
    });
    expect(windows[1]!.combat).toEqual({ targetsPlayer: false, targetPermanentId: "defender", mustBlock: true });
    expect(windows[1]!.actions.map(({ intent }) => intent)).toEqual([
      { type: "declareBlock", blockerPermanentId: "A" },
      { type: "declareBlock", blockerPermanentId: "B" },
    ]);
  });
});

describe("asynchronous training choices", () => {
  it("skips activations that return to the same visible main state and retries after progress", async () => {
    const setup = setupEngine({});
    await setup.ready();
    const policy = createAsyncTrainingPolicy(
      setup.engine,
      0,
      async () => 0,
      undefined,
      () => [
        {
          intent: { type: "activateEffect", sourceInstanceId: "source", effectKey: "optional-play" },
          label: "Optional play",
        },
        { intent: { type: "endPhase" }, label: "Pass" },
      ],
    );
    const view = buildBotView(setup.state, 0)!;
    expect((await policy.chooseMainAction(view)).type).toBe("activateEffect");
    await policy.answerDecision(view, {
      decisionId: "optional-play",
      seat: 0,
      kind: "selectCards",
      promptText: "Choose",
      options: { candidateInstanceIds: [], min: 0, max: 1 },
    });
    expect((await policy.chooseMainAction(view)).type).toBe("endPhase");
    setup.state.memory++;
    expect((await policy.chooseMainAction(buildBotView(setup.state, 0)!)).type).toBe("activateEffect");
    setup.state.turnCount++;
    expect((await policy.chooseMainAction(buildBotView(setup.state, 0)!)).type).toBe("activateEffect");
  });

  it.each([
    "mulligan",
    "optional",
    "chooseOption",
    "orderTriggers",
    "orderCards",
    "selectCards",
    "chooseTargets",
  ] as const)("preserves synchronous windows and responses for %s", async (kind) => {
    const setup = setupEngine({});
    await setup.ready();
    const request: DecisionRequest = {
      decisionId: "choice",
      seat: 0,
      kind,
      promptText: "Choose",
      options: {
        candidateInstanceIds: ["A", "B", "C"],
        min: 2,
        max: 2,
        choices: ["first", "second"],
        triggerKeys: ["first", "second"],
      },
    };
    const syncWindows: TrainingWindow[] = [];
    const asyncWindows: TrainingWindow[] = [];
    const synchronous = createTrainingPolicy(setup.engine, 0, (window) => {
      syncWindows.push(window);
      return window.actions.length - 1;
    });
    const asynchronous = createAsyncTrainingPolicy(setup.engine, 0, async (window, signal) => {
      expect(signal.aborted).toBe(false);
      await Promise.resolve();
      asyncWindows.push(window);
      return window.actions.length - 1;
    });
    const view = buildBotView(setup.state, 0);
    const expected = synchronous.answerDecision(view, request);
    expect(await asynchronous.answerDecision(view, request)).toEqual(expected);
    expect(asyncWindows).toEqual(syncWindows);
  });

  it("stops a multi-card choice after cancellation without requesting its next step", async () => {
    const setup = setupEngine({});
    await setup.ready();
    const controller = new AbortController();
    let finish!: (index: number) => void;
    let calls = 0;
    const policy = createAsyncTrainingPolicy(setup.engine, 0, async (_window, signal) => {
      calls++;
      expect(signal).toBe(controller.signal);
      return new Promise<number>((resolve) => {
        finish = resolve;
      });
    });
    const answer = policy.answerDecision(
      buildBotView(setup.state, 0),
      {
        decisionId: "order",
        seat: 0,
        kind: "orderCards",
        promptText: "Order",
        options: { candidateInstanceIds: ["A", "B", "C"] },
      },
      controller.signal,
    );
    controller.abort(new Error("selection cancelled"));
    finish(0);
    await expect(answer).rejects.toThrow("selection cancelled");
    expect(calls).toBe(1);
  });

  it("rejects invalid asynchronous indices and never calls the model for an already-aborted request", async () => {
    const setup = setupEngine({});
    await setup.ready();
    let calls = 0;
    const policy = createAsyncTrainingPolicy(setup.engine, 0, async () => {
      calls++;
      return -1;
    });
    const view = buildBotView(setup.state, 0)!;
    await expect(policy.chooseBarrierResponse(view, "unit")).rejects.toThrow("Invalid training action index");
    const controller = new AbortController();
    controller.abort(new Error("already cancelled"));
    await expect(policy.chooseBarrierResponse(view, "unit", controller.signal)).rejects.toThrow("already cancelled");
    expect(calls).toBe(1);
  });
});
