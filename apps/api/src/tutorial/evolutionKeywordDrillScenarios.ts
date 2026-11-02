import digisorption from "#api/engine/scenarios/drill-digisorption.fixture";
import digiBurst from "#api/engine/scenarios/drill-digi-burst.fixture";
import delay from "#api/engine/scenarios/drill-delay.fixture";
import blastDigivolve from "#api/engine/scenarios/drill-blast-digivolve.fixture";
import mindLink from "#api/engine/scenarios/drill-mind-link.fixture";
import blastDnaDigivolve from "#api/engine/scenarios/drill-blast-dna-digivolve.fixture";
import link from "#api/engine/scenarios/drill-link.fixture";
import useReq from "#api/engine/scenarios/drill-use-req.fixture";
import ascension from "#api/engine/scenarios/drill-ascension.fixture";
import detach from "#api/engine/scenarios/drill-detach.fixture";
import succession from "#api/engine/scenarios/drill-succession.fixture";
import type { ScenarioFixture } from "#api/engine/scenario/types";

export const evolutionKeywordDrillScenarios: Readonly<Record<string, ScenarioFixture>> = {
  "drill-digisorption": digisorption,
  "drill-digi-burst": digiBurst,
  "drill-delay": delay,
  "drill-blast-digivolve": blastDigivolve,
  "drill-mind-link": mindLink,
  "drill-blast-dna-digivolve": blastDnaDigivolve,
  "drill-link": link,
  "drill-use-req": useReq,
  "drill-ascension": ascension,
  "drill-detach": detach,
  "drill-succession": succession,
};
