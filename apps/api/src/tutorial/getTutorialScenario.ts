import type { ScenarioFixture } from "#api/engine/scenario/types";
import attackSecurity from "#api/engine/scenarios/tutorial-attack-security.fixture";
import block from "#api/engine/scenarios/tutorial-block.fixture";
import digivolve from "#api/engine/scenarios/tutorial-digivolve.fixture";
import hatch from "#api/engine/scenarios/tutorial-hatch.fixture";
import memory from "#api/engine/scenarios/tutorial-memory.fixture";
import tamers from "#api/engine/scenarios/tutorial-tamers.fixture";

const scenarios: Readonly<Record<string, ScenarioFixture>> = {
  "tutorial-attack-security": attackSecurity,
  "tutorial-hatch": hatch,
  "tutorial-memory": memory,
  "tutorial-digivolve": digivolve,
  "tutorial-block": block,
  "tutorial-tamers": tamers,
};

export function getTutorialScenario(lessonId: string): ScenarioFixture | undefined {
  if (!Object.hasOwn(scenarios, lessonId)) {
    return undefined;
  }
  return structuredClone(scenarios[lessonId]);
}
