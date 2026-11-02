import type { ScenarioFixture } from "#api/engine/scenario/types";
import derivedTrashTriggers from "#api/engine/scenarios/practice-derived-trash-triggers.fixture";
import orderBeforeDigivolving from "#api/engine/scenarios/practice-order-before-digivolving.fixture";

export const advancedEffectScenarios: Readonly<Record<string, ScenarioFixture>> = {
  "practice-derived-trash-triggers": derivedTrashTriggers,
  "practice-order-before-digivolving": orderBeforeDigivolving,
};
