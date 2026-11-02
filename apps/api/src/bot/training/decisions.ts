import {
  canAssignDistinctColors,
  digiXrosRequirementFor,
  getCardDefinition,
  type DecisionRequest,
  type Intent,
} from "@aegis/shared";
import { materialsSatisfyRecipe } from "../../engine/actions/digiXros.js";
import { assemblyMaterialSteps } from "./assembly.js";
import { isTrainingMaterialSelectionComplete } from "#api/bot/training/isTrainingMaterialSelectionComplete";

/** Public metadata only: never resolve a blind choice from the engine's hidden zones. */
export interface SelectionCard {
  cardId?: string;
  playCost?: number;
  dp?: number;
  colors?: readonly string[];
  names?: readonly string[];
}

export interface DecisionChoice {
  key: string;
  label: string;
  referenceId?: string;
  intent?: Intent;
}

export interface DecisionStep {
  request: DecisionRequest;
  selected: readonly string[];
  choices: readonly DecisionChoice[];
}

export type SelectDecisionChoice = (step: DecisionStep) => number;

function* selectedIndex(step: DecisionStep): Generator<DecisionStep, DecisionChoice, number> {
  if (step.choices.length === 0) throw new Error(`No legal completion for decision ${step.request.decisionId}`);
  const index = yield step;
  if (!Number.isInteger(index) || index < 0 || index >= step.choices.length) {
    throw new Error(`Invalid action index ${index} for decision ${step.request.decisionId}`);
  }
  return step.choices[index]!;
}

/** Execute the same decision program used by asynchronous inference. */
export function chooseDecisionIntent(
  request: DecisionRequest,
  cards: ReadonlyMap<string, SelectionCard>,
  choose: SelectDecisionChoice,
): Intent {
  const steps = decisionSteps(request, cards);
  let step = steps.next();
  while (!step.done) step = steps.next(choose(step.value));
  return step.value;
}

/** Every subset and order is reachable without materializing exponentially many intents. */
export function* decisionSteps(
  request: DecisionRequest,
  cards: ReadonlyMap<string, SelectionCard>,
): Generator<DecisionStep, Intent, number> {
  const respond = (response: Extract<Intent, { type: "respondDecision" }>["response"]): Intent => ({
    type: "respondDecision",
    decisionId: request.decisionId,
    response,
  });
  const options = request.options ?? {};
  function* direct(choices: DecisionChoice[]): Generator<DecisionStep, Intent, number> {
    return (yield* selectedIndex({ request, selected: [], choices })).intent!;
  }
  switch (request.kind) {
    case "mulligan":
      return yield* direct(
        [true, false].map((keep) => ({
          key: String(keep),
          label: keep ? "Keep" : "Mulligan",
          intent: { type: "mulligan", keep },
        })),
      );
    case "optional":
      return yield* direct(
        [true, false].map((accept) => ({
          key: String(accept),
          label: accept ? "Accept" : "Decline",
          intent: respond({ kind: "optional", accept }),
        })),
      );
    case "chooseOption":
      return yield* direct(
        (options.choices ?? []).map((label, optionIndex) => ({
          key: String(optionIndex),
          label,
          intent: respond({ kind: "chooseOption", optionIndex }),
        })),
      );
    case "orderTriggers":
      // A one-entry plan lets the real resolver ask the remaining ordering and
      // optional questions after that effect has changed the board.
      return yield* direct(
        (options.triggerKeys ?? []).map((key, index) => ({
          key,
          label: options.triggerDescriptions?.[index] ?? key,
          referenceId: key,
          intent: respond({ kind: "orderTriggers", order: [key] }),
        })),
      );
    case "orderCards": {
      const remaining = [...(options.candidateInstanceIds ?? [])];
      const order: string[] = [];
      while (remaining.length > 0) {
        const choice = yield* selectedIndex({
          request,
          selected: [...order],
          choices: remaining.map((id) => ({ key: id, label: "Order next", referenceId: id })),
        });
        order.push(choice.key);
        remaining.splice(remaining.indexOf(choice.key), 1);
      }
      return respond({ kind: "orderCards", order });
    }
    case "selectCards":
    case "chooseTargets": {
      if (options.assemblyCardId) {
        const offered = (options.candidateInstanceIds ?? []).map((instanceId) => {
          const cardId = cards.get(instanceId)?.cardId;
          if (cardId === undefined)
            throw new Error(`Missing visible card identity for Assembly material ${instanceId}`);
          return { instanceId, cardId };
        });
        const steps = assemblyMaterialSteps(options.assemblyCardId, offered, (options.min ?? 0) === 0);
        let step = steps.next();
        while (!step.done) step = steps.next(yield { request, ...step.value });
        return respond({ kind: request.kind, instanceIds: step.value });
      }
      const isComplete = (selected: readonly string[]): boolean =>
        isTrainingMaterialSelectionComplete({ options, cards, selected });
      const offered = [...new Set(options.candidateInstanceIds ?? [])];
      // An accepted "you may" pick already answered its yes/no; its floor of zero is a human
      // back-out, not a second decline the policy should learn.
      const floor = options.purpose === "acceptedOptional" ? Math.max(options.min ?? 0, 1) : (options.min ?? 0);
      const minimum = Math.min(floor, offered.length);
      const maximum = Math.min(options.max ?? offered.length, offered.length);
      const valid = (ids: readonly string[]): boolean => {
        if (ids.length > maximum) return false;
        if (options.digiXrosCardId !== undefined && ids.length > 0) {
          const recipe = digiXrosRequirementFor(options.digiXrosCardId)?.[0];
          if (recipe === undefined) throw new Error(`Missing DigiXros recipe for ${options.digiXrosCardId}`);
          const definitions = ids.map((id) => {
            const cardId = cards.get(id)?.cardId;
            const definition = cardId === undefined ? undefined : getCardDefinition(cardId);
            if (definition === undefined) throw new Error(`Missing visible DigiXros material identity ${id}`);
            return definition;
          });
          if (!materialsSatisfyRecipe(definitions, recipe.materials)) return false;
          if (recipe.maxMaterials !== undefined && ids.length > recipe.maxMaterials) return false;
          if (
            options.digiXrosMaterialLimits?.some(
              ({ candidateInstanceIds, max }) => ids.filter((id) => candidateInstanceIds.includes(id)).length > max,
            )
          )
            return false;
        }
        let cost = 0;
        let dp = 0;
        const cardIds = new Set<string>();
        const names = new Set<string>();
        const colors: (readonly string[])[] = [];
        for (const id of ids) {
          const card = cards.get(id);
          const requireValue = <T>(value: T | undefined, property: string): T => {
            if (value === undefined) throw new Error(`Missing visible ${property} for constrained choice ${id}`);
            return value;
          };
          if (options.maxTotalPlayCost !== undefined) cost += Math.max(0, requireValue(card?.playCost, "play cost"));
          if (options.maxTotalDP !== undefined) dp += Math.max(0, requireValue(card?.dp, "DP"));
          if (options.distinctCardIds) {
            const cardId = requireValue(card?.cardId, "card identity");
            if (cardIds.has(cardId)) return false;
            cardIds.add(cardId);
          }
          if (options.distinctNames) {
            const values = requireValue(card?.names, "names").map((name) => name.toLowerCase());
            if (values.some((name) => names.has(name))) return false;
            for (const name of values) names.add(name);
          }
          if (options.differentColors) {
            const values = requireValue(card?.colors, "colors");
            colors.push(values);
            if (!canAssignDistinctColors(colors)) return false;
          }
        }
        return (
          (options.maxTotalPlayCost === undefined || cost <= options.maxTotalPlayCost) &&
          (options.maxTotalDP === undefined || dp <= options.maxTotalDP)
        );
      };
      const canFinish = (ids: readonly string[], remaining: readonly string[]): boolean => {
        if (!valid(ids)) return false;
        if (ids.length >= minimum && isComplete(ids)) return true;
        if (ids.length + remaining.length < minimum || ids.length >= maximum) return false;
        return remaining.some((id, index) => canFinish([...ids, id], remaining.slice(index + 1)));
      };
      const selected: string[] = [];
      for (;;) {
        const remaining = offered.filter((id) => !selected.includes(id));
        const choices: DecisionChoice[] = remaining
          .filter((id) =>
            canFinish(
              [...selected, id],
              remaining.filter((other) => other !== id),
            ),
          )
          .map((id) => ({ key: id, label: "Select", referenceId: id }));
        if (selected.length >= minimum && valid(selected) && isComplete(selected))
          choices.push({ key: "finish", label: "Finish selection" });
        const choice = yield* selectedIndex({ request, selected: [...selected], choices });
        if (choice.referenceId === undefined) return respond({ kind: request.kind, instanceIds: selected });
        selected.push(choice.referenceId);
      }
    }
  }
}
