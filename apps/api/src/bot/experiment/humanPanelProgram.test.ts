import { describe, expect, it } from "vitest";
import catalog from "#api/bot/evolution/programs/human-panel-v2.json" with { type: "json" };
import { parseHeuristic } from "#api/bot/evolution/heuristic";
import { humanPanelProgram } from "#api/bot/experiment/humanPanelProgram";

describe("human panel program", () => {
  it("loads a validated scoring program and planner parameters", () => {
    expect(humanPanelProgram.program).toEqual(parseHeuristic(catalog.program));
    expect(humanPanelProgram.program.basePolicy).toBeUndefined();
    expect(humanPanelProgram.planner).toEqual(catalog.planner);
    expect(Object.isFrozen(humanPanelProgram.planner.weights)).toBe(true);
  });
});
