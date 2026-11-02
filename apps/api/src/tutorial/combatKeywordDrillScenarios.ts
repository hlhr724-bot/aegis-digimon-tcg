import type { ScenarioFixture } from "#api/engine/scenario/types";
import retaliation from "#api/engine/scenarios/drill-retaliation.fixture";
import blitz from "#api/engine/scenarios/drill-blitz.fixture";
import raid from "#api/engine/scenarios/drill-raid.fixture";
import collision from "#api/engine/scenarios/drill-collision.fixture";
import vortex from "#api/engine/scenarios/drill-vortex.fixture";
import overclock from "#api/engine/scenarios/drill-overclock.fixture";
import iceclad from "#api/engine/scenarios/drill-iceclad.fixture";
import execute from "#api/engine/scenarios/drill-execute.fixture";
import progress from "#api/engine/scenarios/drill-progress.fixture";
import engage from "#api/engine/scenarios/drill-engage.fixture";
import barrier from "#api/engine/scenarios/drill-barrier.fixture";
import training from "#api/engine/scenarios/drill-training.fixture";

export const combatKeywordDrillScenarios: Readonly<Record<string, ScenarioFixture>> = {
  "drill-retaliation": retaliation,
  "drill-blitz": blitz,
  "drill-raid": raid,
  "drill-collision": collision,
  "drill-vortex": vortex,
  "drill-overclock": overclock,
  "drill-iceclad": iceclad,
  "drill-execute": execute,
  "drill-progress": progress,
  "drill-engage": engage,
  "drill-barrier": barrier,
  "drill-training": training,
};
