import type { ScenarioFixture } from "#api/engine/scenario/types";
import alliance from "#api/engine/scenarios/drill-alliance.fixture";
import blocker from "#api/engine/scenarios/drill-blocker.fixture";
import deDigivolve from "#api/engine/scenarios/drill-de-digivolve.fixture";
import draw from "#api/engine/scenarios/drill-draw.fixture";
import jamming from "#api/engine/scenarios/drill-jamming.fixture";
import piercing from "#api/engine/scenarios/drill-piercing.fixture";
import reboot from "#api/engine/scenarios/drill-reboot.fixture";
import recovery from "#api/engine/scenarios/drill-recovery.fixture";
import rush from "#api/engine/scenarios/drill-rush.fixture";
import securityAttack from "#api/engine/scenarios/drill-security-attack.fixture";
import { combatKeywordDrillScenarios } from "#api/tutorial/combatKeywordDrillScenarios";
import { protectionKeywordDrillScenarios } from "#api/tutorial/protectionKeywordDrillScenarios";
import { evolutionKeywordDrillScenarios } from "#api/tutorial/evolutionKeywordDrillScenarios";

const scenarios: Readonly<Record<string, ScenarioFixture>> = {
  ...combatKeywordDrillScenarios,
  ...protectionKeywordDrillScenarios,
  ...evolutionKeywordDrillScenarios,
  "drill-blocker": blocker,
  "drill-rush": rush,
  "drill-piercing": piercing,
  "drill-security-attack": securityAttack,
  "drill-recovery": recovery,
  "drill-draw": draw,
  "drill-jamming": jamming,
  "drill-reboot": reboot,
  "drill-de-digivolve": deDigivolve,
  "drill-alliance": alliance,
};

export function getKeywordDrillScenario(drillId: string): ScenarioFixture | undefined {
  if (!Object.hasOwn(scenarios, drillId)) {
    return undefined;
  }
  return structuredClone(scenarios[drillId]);
}
