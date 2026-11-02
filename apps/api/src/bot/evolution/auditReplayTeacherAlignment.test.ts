import { describe, expect, it } from "vitest";
import { auditReplayTeacherAlignment } from "#api/bot/evolution/auditReplayTeacherAlignment";
import { createHeuristicExposureChooser } from "#api/bot/evolution/createHeuristicExposureChooser";
import { actionFeatures, chooseHeuristic, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import type { TrainingWindow } from "#api/bot/training/policy";

function buildWindow(): TrainingWindow {
  return {
    kind: "breeding",
    selected: [],
    observation: {
      schemaVersion: 4,
      seat: 0,
      turnSeat: 0,
      turn: 1,
      phase: "breeding",
      memory: 0,
      history: { seenCardIds: [], knownCards: [], recent: [] },
      revealed: [],
      players: [0, 1].map((seat) => ({
        seat: seat as 0 | 1,
        handCount: 0,
        deckCount: 40,
        eggDeckCount: 4,
        securityCount: 5,
        hand: [],
        trash: [],
        delay: [],
        faceUpSecurity: [],
        board: [],
      })),
    },
    actions: [
      { intent: { type: "endPhase" }, label: "Skip" },
      { intent: { type: "hatchEgg" }, label: "Hatch" },
    ],
  };
}

const baseline: HeuristicProgram = {
  schemaVersion: 1,
  title: "Control",
  rules: [{ feature: "pass", weight: 2, advice: "Skip." }],
};

function buildProgram(weight: number): HeuristicProgram {
  return { ...baseline, rules: [...baseline.rules, { feature: "hatch", weight, advice: "Hatch." }] };
}

function buildCase() {
  const window = buildWindow();
  return {
    position: { hash: "opening" },
    result: {
      valid: true,
      preferred: true,
      baseline: 0,
      alternative: 1,
      difference: 0.2,
      context: {
        observation: window.observation,
        actions: window.actions.map((_, index) => ({
          index,
          features: actionFeatures(window, index),
        })),
      },
    },
  };
}

describe("teacher alignment", () => {
  it("requires a unique recommended winner rather than a matching rule or a tie", () => {
    for (const weight of [1, 2]) {
      expect(
        auditReplayTeacherAlignment({ baseline, program: buildProgram(weight), cases: [buildCase()] }).eligible,
      ).toBe(false);
    }
    expect(auditReplayTeacherAlignment({ baseline, program: buildProgram(3), cases: [buildCase()] }).supported).toBe(1);
  });

  it("does not use invalid or inconclusive comparisons as alignment evidence", () => {
    const entry = buildCase();
    entry.result.preferred = false;
    expect(auditReplayTeacherAlignment({ baseline, program: buildProgram(3), cases: [entry] }).eligible).toBe(false);
    entry.result.preferred = true;
    entry.result.valid = false;
    expect(auditReplayTeacherAlignment({ baseline, program: buildProgram(3), cases: [entry] }).eligible).toBe(false);
  });

  it("accepts identical hand Tamer copies but rejects ties between different cards", () => {
    const entry = buildCase();
    const features = { ...entry.result.context.actions[1]!.features, hatch: 0, playTamer: 1, sourceInHand: 1 };
    const actions: { index: number; features: typeof features; card?: { cardId: string } }[] = [
      entry.result.context.actions[0]!,
      { index: 1, features, card: { cardId: "BT1-085" } },
      { index: 2, features, card: { cardId: "BT1-085" } },
    ];
    const cases = [{ ...entry, result: { ...entry.result, context: { ...entry.result.context, actions } } }];
    const program: HeuristicProgram = {
      ...baseline,
      rules: [...baseline.rules, { feature: "playTamer", weight: 3, advice: "Develop a Tamer." }],
    };
    expect(auditReplayTeacherAlignment({ baseline, program, cases }).supported).toBe(1);
    const unchangedCases = cases.map((item) => ({
      ...item,
      result: { ...item.result, baseline: 1, alternative: 2 },
    }));
    const unrelated: HeuristicProgram = {
      ...program,
      rules: [...program.rules, { feature: "cost", weight: -0.1, advice: "Spend carefully." }],
    };
    expect(auditReplayTeacherAlignment({ baseline: program, program: unrelated, cases: unchangedCases }).eligible).toBe(
      false,
    );
    actions[2]!.card = { cardId: "BT1-086" };
    expect(auditReplayTeacherAlignment({ baseline, program, cases }).eligible).toBe(false);
  });

  it("rejects an incompatible stored baseline", () => {
    const entry = buildCase();
    entry.result.baseline = 1;
    expect(() => auditReplayTeacherAlignment({ baseline, program: buildProgram(3), cases: [entry] })).toThrow(
      "baseline score changed",
    );
  });
});

describe("decision exposure", () => {
  it("distinguishes triggered scoring from changed choices and preserves the actual chooser", () => {
    for (const weight of [1, 3]) {
      const program = buildProgram(weight);
      const probe = createHeuristicExposureChooser({ baseline, program, seed: 42 });
      expect(probe.choose(buildWindow())).toBe(chooseHeuristic(program, buildWindow(), 42));
      expect(probe.report).toMatchObject({ decisions: 1, triggered: 1, changed: weight === 3 ? 1 : 0 });
    }
  });

  it("recognizes baseline rules after JSON key reordering", () => {
    const program: HeuristicProgram = { ...baseline, rules: [{ advice: "Skip.", weight: 2, feature: "pass" }] };
    const probe = createHeuristicExposureChooser({ baseline, program, seed: 42 });
    probe.choose(buildWindow());
    expect(probe.report).toMatchObject({ triggered: 0, changed: 0 });
  });

  it("counts duplicated baseline rules as added contributions", () => {
    const program = { ...baseline, rules: [...baseline.rules, ...baseline.rules] };
    const probe = createHeuristicExposureChooser({ baseline, program, seed: 42 });
    probe.choose(buildWindow());
    expect(probe.report).toMatchObject({ triggered: 1, changed: 0 });
  });
});
