import type { DecisionApi } from "#api/engine/effects/context/decisions";
import { noPromptDecisionApis } from "#api/engine/decisions/noPromptDecisionApis";

export function createNoPromptDecisionApi(): DecisionApi {
  const api = Object.freeze({
    optional: async () => false,
    chooseTargets: async () => [],
    selectCards: async () => [],
    selectPermanents: async () => [],
    chooseOption: async () => 0,
  });
  noPromptDecisionApis.add(api);
  return api;
}
