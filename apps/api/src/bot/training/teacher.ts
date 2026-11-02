import { isDeepStrictEqual } from "node:util";
import type { Intent } from "@aegis/shared";
import type { TrainingWindow } from "./policy.js";
import { isTrainingMaterialSelectionComplete } from "#api/bot/training/isTrainingMaterialSelectionComplete";

/** Map a demonstration onto the unchanged legal action space; unavailable labels stay explicit. */
export function teacherActionIndex(
  window: TrainingWindow,
  intent: Intent,
  originatingIntent?: Intent,
): number | undefined {
  if (
    intent.type === "playCard" &&
    intent.assembly !== undefined &&
    window.kind === "selectCards" &&
    window.request === undefined
  ) {
    // Private Assembly windows carry material identities, but no destination. Bind
    // them to the selected legal declaration before using the teacher's recipe.
    if (
      originatingIntent?.type !== "playCard" ||
      originatingIntent.assembly === undefined ||
      originatingIntent.instanceId !== intent.instanceId
    )
      return undefined;
    const order = intent.assembly.materialInstanceIds;
    if (
      order.length === 0 ||
      new Set(order).size !== order.length ||
      window.selected.length > order.length ||
      window.selected.some((id, index) => id !== order[index])
    )
      return undefined;
    if (
      !window.actions.every(
        (action) =>
          action.intent.type === "respondDecision" &&
          action.intent.decisionId === "assembly" &&
          action.intent.response.kind === "selectCards",
      )
    )
      return undefined;
    const next = order[window.selected.length];
    const index = window.actions.findIndex((action) => {
      const marker = action.intent;
      if (marker.type !== "respondDecision" || marker.response.kind !== "selectCards") return false;
      // Finish keeps the destination sourceId. The private response, rather than
      // a display label or sourceId, distinguishes it from a material choice.
      return next === undefined
        ? marker.response.instanceIds.length === 0
        : marker.response.instanceIds.length === 1 && marker.response.instanceIds[0] === next;
    });
    return index < 0 ? undefined : index;
  }
  if (intent.type === "respondDecision" && window.request !== undefined) {
    if (intent.decisionId !== window.request.decisionId) return undefined;
    const response = intent.response;
    if (response.kind !== window.request.kind) return undefined;
    if (response.kind === "selectCards" || response.kind === "chooseTargets" || response.kind === "orderCards") {
      const order = response.kind === "orderCards" ? response.order : assemblySelection(window, response.instanceIds);
      if (window.selected.some((id, index) => id !== order[index])) return undefined;
      const next = order[window.selected.length];
      const index = window.actions.findIndex((action) =>
        // Finish and decline markers have no material reference. Assembly uses its own
        // labels, but the teacher's empty selection has the same meaning there.
        next === undefined ? action.sourceId === undefined : action.sourceId === next,
      );
      return index < 0 ? undefined : index;
    }
  }
  const declared = canonicalDeclaration(intent);
  const index = window.actions.findIndex((action) => isDeepStrictEqual(canonicalDeclaration(action.intent), declared));
  return index < 0 ? undefined : index;
}

function assemblySelection(window: TrainingWindow, selected: readonly string[]): readonly string[] {
  const options = window.request?.options;
  if (options?.assemblyCardId === undefined || window.selected.length > 0) return selected;
  const cards = new Map((options.visibleCards ?? []).map(({ instanceId, cardId }) => [instanceId, { cardId }]));
  if (selected.some((id) => !cards.has(id))) return selected;
  return isTrainingMaterialSelectionComplete({ options, cards, selected }) ? selected : [];
}

/** Clients spell some declarations with defaults the engine treats as absent. */
function canonicalDeclaration(intent: Intent): Intent {
  if (intent.type === "attack" && intent.vortex === false) {
    const { vortex: _vortex, ...attack } = intent;
    return attack;
  }
  if (
    intent.type === "digivolve" &&
    intent.alternateRequirementIndex !== undefined &&
    intent.useAlternateCost === true
  ) {
    const { useAlternateCost: _useAlternateCost, ...digivolve } = intent;
    return digivolve;
  }
  return intent;
}
