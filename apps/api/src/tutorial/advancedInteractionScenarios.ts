import type { ScenarioFixture } from "#api/engine/scenario/types";
import sacrificeRecruit from "#api/engine/scenarios/practice-inherited-sacrifice-recruit.fixture";
import unsuspendEngage from "#api/engine/scenarios/practice-inherited-unsuspend-engage.fixture";

export const advancedInteractionScenarios: Readonly<Record<string, ScenarioFixture>> = {
  "practice-inherited-sacrifice-recruit": sacrificeRecruit,
  "practice-inherited-unsuspend-engage": unsuspendEngage,
};
