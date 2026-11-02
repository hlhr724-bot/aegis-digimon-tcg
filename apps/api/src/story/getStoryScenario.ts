import { getCatalogStoryScenario } from "#api/story/getCatalogStoryScenario";
import scenario0 from "#api/engine/scenarios/ice-clad-story-opening.fixture";
import scenario1 from "#api/engine/scenarios/puppets-musketeers-story-opening.fixture";
import scenario2 from "#api/engine/scenarios/birds-crystal-palace-story-opening.fixture";
import scenario3 from "#api/engine/scenarios/guardians-deep-shoto-story-adaptation.fixture";
import scenario4 from "#api/engine/scenarios/guardians-deep-owen-story-adaptation.fixture";
import scenario5 from "#api/engine/scenarios/guardians-deep-close-story-adaptation.fixture";
import scenario6 from "#api/engine/scenarios/black-emperor-dragon-story-adaptation.fixture";
import scenario7 from "#api/engine/scenarios/emperor-dragon-calamity-story-adaptation.fixture";
import scenario8 from "#api/engine/scenarios/dragonkin-aggro-story-adaptation.fixture";
import scenario9 from "#api/engine/scenarios/gaiamon-story-adaptation.fixture";
import scenario10 from "#api/engine/scenarios/pyramidimon-story-adaptation.fixture";
import scenario11 from "#api/engine/scenarios/abbadomon-story-adaptation.fixture";
import scenario12 from "#api/engine/scenarios/arisa-rematch-story-adaptation.fixture";
import scenario13 from "#api/engine/scenarios/galacticmon-rematch-story-adaptation.fixture";
import scenario14 from "#api/engine/scenarios/yuuki-metallic-volcanic-initial-loss-story-adaptation.fixture";
import scenario15 from "#api/engine/scenarios/yuuki-heavy-metal-play-story-adaptation.fixture";
import scenario16 from "#api/engine/scenarios/yuuki-temple-priest-loss-story-adaptation.fixture";
import scenario17 from "#api/engine/scenarios/winr-good-game-story-adaptation.fixture";
import scenario18 from "#api/engine/scenarios/ryutaro-heroes-story-adaptation.fixture";
import scenario19 from "#api/engine/scenarios/suzune-ice-age-story-adaptation.fixture";
import scenario20 from "#api/engine/scenarios/altea-shinjuku-story-adaptation.fixture";
import scenario21 from "#api/engine/scenarios/shoto-arisa-practice-story-adaptation.fixture";
import scenario22 from "#api/engine/scenarios/yuuki-emerald-npc-story-adaptation.fixture";
import scenario23 from "#api/engine/scenarios/yuuki-huckmon-story-adaptation.fixture";
import scenario24 from "#api/engine/scenarios/zenith-omekamon-story-adaptation.fixture";
import scenario25 from "#api/engine/scenarios/world-championship-finals-story-adaptation.fixture";
import scenario26 from "#api/engine/scenarios/winr-village-defence-story-adaptation.fixture";
import scenario27 from "#api/engine/scenarios/yuuki-cross-connectia-npcs-story-adaptation.fixture";
import scenario28 from "#api/engine/scenarios/altea-mistymon-story-adaptation.fixture";
import scenario29 from "#api/engine/scenarios/shoto-unchained-final-story-adaptation.fixture";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const scenarios: Readonly<Record<string, ScenarioFixture>> = {
  "ice-knight": scenario0,
  "three-musketeers": scenario1,
  "crystal-sea-palace": scenario2,
  "guardians-deep-shoto": scenario3,
  "guardians-deep-owen": scenario4,
  "guardians-deep-close": scenario5,
  "black-emperor-dragon": scenario6,
  "emperor-dragon-calamity": scenario7,
  "dragonkin-aggro": scenario8,
  gaiamon: scenario9,
  pyramidimon: scenario10,
  abbadomon: scenario11,
  "arisa-rematch": scenario12,
  "galacticmon-rematch": scenario13,
  "yuuki-metallic-volcanic-initial-loss": scenario14,
  "yuuki-heavy-metal-play": scenario15,
  "yuuki-temple-priest-loss": scenario16,
  "winr-good-game": scenario17,
  "ryutaro-heroes": scenario18,
  "suzune-ice-age": scenario19,
  "altea-shinjuku": scenario20,
  "shoto-arisa-practice": scenario21,
  "yuuki-emerald-npc": scenario22,
  "yuuki-huckmon": scenario23,
  "zenith-omekamon": scenario24,
  "world-championship-finals": scenario25,
  "winr-village-defence": scenario26,
  "yuuki-cross-connectia-npcs": scenario27,
  "altea-mistymon": scenario28,
  "shoto-unchained-final": scenario29,
};

export function getStoryScenario(battleId: string): ScenarioFixture | undefined {
  const world = getCatalogStoryScenario({ battleId });
  if (world) {
    return world;
  }
  if (!Object.hasOwn(scenarios, battleId)) {
    return undefined;
  }
  return structuredClone(scenarios[battleId]);
}
