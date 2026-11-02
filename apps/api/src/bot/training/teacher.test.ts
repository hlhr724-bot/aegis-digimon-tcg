import { describe, expect, it } from "vitest";
import { GameState, type Intent } from "@aegis/shared";
import { trainingObservation } from "./observation.js";
import { teacherActionIndex } from "./teacher.js";
import { createTrainingPolicy, type TrainingWindow } from "./policy.js";
import { setupEngine } from "../../engine/testkit/harness.js";
import { createEvaluationPolicy } from "../policy.js";
import { buildBotView } from "../view.js";

function selection(selected: string[]): TrainingWindow {
  return {
    observation: trainingObservation(new GameState(), 0),
    kind: "selectCards",
    selected,
    request: { decisionId: "D", seat: 0, kind: "selectCards", promptText: "Choose" },
    actions: [
      ...["A", "B"]
        .filter((id) => !selected.includes(id))
        .map((id) => ({ sourceId: id, label: "Select", intent: { type: "endPhase" } as Intent })),
      { label: "Finish selection", intent: { type: "endPhase" } },
    ],
  };
}

describe("demonstration labels", () => {
  it("maps a full teacher selection into ordered subchoices and finish", () => {
    const intent: Intent = {
      type: "respondDecision",
      decisionId: "D",
      response: { kind: "selectCards", instanceIds: ["B", "A"] },
    };
    expect(teacherActionIndex(selection([]), intent)).toBe(1);
    expect(teacherActionIndex(selection(["B"]), intent)).toBe(0);
    expect(teacherActionIndex(selection(["B", "A"]), intent)).toBe(0);
    expect(teacherActionIndex(selection(["A"]), intent)).toBeUndefined();
    expect(teacherActionIndex(selection([]), { ...intent, decisionId: "stale" })).toBeUndefined();
  });

  it("maps client declarations that spell out engine defaults", () => {
    const window: TrainingWindow = {
      observation: trainingObservation(new GameState(), 0),
      kind: "main",
      selected: [],
      actions: [
        { label: "End main phase", intent: { type: "endPhase" } },
        {
          label: "Attack player",
          intent: { type: "attack", attackerPermanentId: "perm-3", target: { kind: "player" } },
        },
        {
          label: "Alternate digivolution 2",
          intent: { type: "digivolve", instanceId: "s0-a", permanentId: "perm-3", alternateRequirementIndex: 2 },
        },
      ],
    };
    expect(
      teacherActionIndex(window, {
        type: "attack",
        attackerPermanentId: "perm-3",
        target: { kind: "player" },
        vortex: false,
      }),
    ).toBe(1);
    expect(
      teacherActionIndex(window, {
        type: "attack",
        attackerPermanentId: "perm-3",
        target: { kind: "player" },
        vortex: true,
      }),
    ).toBeUndefined();
    expect(
      teacherActionIndex(window, {
        type: "digivolve",
        instanceId: "s0-a",
        permanentId: "perm-3",
        useAlternateCost: true,
        alternateRequirementIndex: 2,
      }),
    ).toBe(2);
  });

  it("records unavailable teacher actions without changing legal actions", async () => {
    const setup = setupEngine({ 0: { hand: ["BT26-025"], breeding: { card: "ST23-01" } } });
    await setup.ready();
    const view = buildBotView(setup.state, 0)!;
    const windows: TrainingWindow[] = [];
    const choose = (window: TrainingWindow) => {
      windows.push(window);
      return 0;
    };
    createTrainingPolicy(setup.engine, 0, choose).chooseMainAction(view);
    const teacher = createEvaluationPolicy();
    teacher.chooseMainAction = () => ({ type: "playCard", instanceId: "absent" });
    createTrainingPolicy(setup.engine, 0, choose, teacher).chooseMainAction(view);
    expect(windows[1]!.actions).toEqual(windows[0]!.actions);
    expect(windows[1]!.teacher).toEqual({ action: null });
    expect(windows[0]!.teacher).toBeUndefined();
  });
});
