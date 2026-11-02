import type { ScenarioFixture } from "#api/engine/scenario/types";
import decoyFixture from "#api/engine/scenarios/drill-decoy.fixture";
import armorPurgeFixture from "#api/engine/scenarios/drill-armor-purge.fixture";
import saveFixture from "#api/engine/scenarios/drill-save.fixture";
import materialSaveFixture from "#api/engine/scenarios/drill-material-save.fixture";
import evadeFixture from "#api/engine/scenarios/drill-evade.fixture";
import fortitudeFixture from "#api/engine/scenarios/drill-fortitude.fixture";
import partitionFixture from "#api/engine/scenarios/drill-partition.fixture";
import scapegoatFixture from "#api/engine/scenarios/drill-scapegoat.fixture";
import decodeFixture from "#api/engine/scenarios/drill-decode.fixture";
import fragmentFixture from "#api/engine/scenarios/drill-fragment.fixture";
import guardFixture from "#api/engine/scenarios/drill-guard.fixture";

export const protectionKeywordDrillScenarios: Readonly<Record<string, ScenarioFixture>> = {
  "drill-decoy": decoyFixture,
  "drill-armor-purge": armorPurgeFixture,
  "drill-save": saveFixture,
  "drill-material-save": materialSaveFixture,
  "drill-evade": evadeFixture,
  "drill-fortitude": fortitudeFixture,
  "drill-partition": partitionFixture,
  "drill-scapegoat": scapegoatFixture,
  "drill-decode": decodeFixture,
  "drill-fragment": fragmentFixture,
  "drill-guard": guardFixture,
};
