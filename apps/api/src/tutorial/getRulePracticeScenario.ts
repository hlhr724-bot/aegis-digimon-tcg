import type { ScenarioFixture } from "#api/engine/scenario/types";
import gamePreparation from "#api/engine/scenarios/practice-game-preparation.fixture";
import ruleChecks from "#api/engine/scenarios/practice-rule-checks.fixture";
import { getTutorialScenario } from "#api/tutorial/getTutorialScenario";
import { advancedEffectScenarios } from "#api/tutorial/advancedEffectScenarios";
import { advancedInteractionScenarios } from "#api/tutorial/advancedInteractionScenarios";

const scenarios: Readonly<Record<string, ScenarioFixture>> = {
  ...advancedEffectScenarios,
  ...advancedInteractionScenarios,
  "practice-game-preparation": gamePreparation,
  "practice-rule-checks": ruleChecks,
};

export function getRulePracticeScenario(id: string): ScenarioFixture | undefined {
  if (Object.hasOwn(scenarios, id)) {
    return structuredClone(scenarios[id]);
  }
  if (!id.startsWith("practice-")) {
    return undefined;
  }
  const fixture = getTutorialScenario(id.replace("practice-", "tutorial-"));
  return fixture ? { ...fixture, name: id } : undefined;
}
