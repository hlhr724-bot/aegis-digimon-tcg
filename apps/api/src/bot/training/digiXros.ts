import { digiXrosRequirementFor, digiXrosZoneExpanderFor, type Intent, type Seat } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import { validateDigiXros } from "../../engine/actions/digiXros.js";
import { digiXrosDeps } from "../../engine/gameEngine/actionDeps.js";
import { definitionOf } from "../../engine/cards/cardData.js";
import type { TrainingAction } from "./actions.js";

/** All expander subsets are distinct declarations, each consuming its own optional resource. */
function* subsets(ids: readonly string[]): Generator<string[]> {
  yield [];
  for (let index = 0; index < ids.length; index++) {
    for (const rest of subsets(ids.slice(index + 1))) yield [ids[index]!, ...rest];
  }
}

/**
 * The validator owns aliases, substitution, recipe slots, source zones and their quotas.
 * Invalid-material prefixes cannot become valid by adding more cards; unaffordable ones can.
 * No legal subset is truncated, and the validator canonicalizes material stack order.
 */
export function digiXrosMainActions(
  engine: GameEngine,
  seat: Seat,
  options: { validationBudget?: number } = {},
): TrainingAction[] {
  const budget = options.validationBudget ?? Number.POSITIVE_INFINITY;
  if (budget !== Number.POSITIVE_INFINITY && (!Number.isInteger(budget) || budget < 0))
    throw new Error("DigiXros validation budget must be a nonnegative integer");
  let validations = 0;
  const player = engine.state.players[seat]!;
  const deps = digiXrosDeps(engine);
  const actions: TrainingAction[] = [];
  for (const card of player.hand) {
    const requirement = digiXrosRequirementFor(card.cardId)?.[0];
    if (requirement === undefined) continue;
    const definition = definitionOf(card.cardId);
    const expanders = Array.from(player.battleArea).filter(
      (permanent) =>
        permanent.controllerSeat === seat &&
        !permanent.isSuspended &&
        permanent.topCard !== undefined &&
        digiXrosZoneExpanderFor(permanent.topCard.cardId)?.appliesTo(definition) === true,
    );
    const candidates = [
      ...new Set([
        ...Array.from(player.hand, ({ instanceId }) => instanceId),
        ...Array.from(player.trash, ({ instanceId }) => instanceId),
        ...Array.from(player.battleArea).flatMap((permanent) => [
          permanent.topCard.instanceId,
          ...Array.from(permanent.stack, ({ instanceId }) => instanceId),
        ]),
        ...(deps.ruleTrashMaterialCandidates?.(card) ?? []).map(({ instanceId }) => instanceId),
      ]),
    ].filter((id) => id !== card.instanceId);
    if (candidates.length === 0) continue;
    const cap =
      requirement.maxMaterials ??
      (requirement.materials.length === 1 ? candidates.length : requirement.materials.length);
    for (const expanderPermanentIds of subsets(expanders.map((p) => p.permanentId))) {
      if (validations >= budget) return actions;
      function visit(selected: string[], remaining: readonly string[]): void {
        if (selected.length >= cap) return;
        for (let index = 0; index < remaining.length; index++) {
          if (validations >= budget) return;
          const materialInstanceIds = [...selected, remaining[index]!];
          const intent: Extract<Intent, { type: "playCard" }> & {
            digiXros: NonNullable<Extract<Intent, { type: "playCard" }>["digiXros"]>;
          } = {
            type: "playCard",
            instanceId: card.instanceId,
            digiXros: { materialInstanceIds, ...(expanderPermanentIds.length === 0 ? {} : { expanderPermanentIds }) },
          };
          validations++;
          const check = validateDigiXros(engine.state, seat, intent, deps);
          if (check.ok)
            actions.push({
              intent,
              label: "DigiXros play",
              sourceId: card.instanceId,
              materialIds: [...materialInstanceIds, ...expanderPermanentIds],
              projectedCost: check.cost,
            });
          if (check.ok || check.reason === "insufficient-memory")
            visit(materialInstanceIds, remaining.slice(index + 1));
        }
      }
      visit([], candidates);
    }
  }
  return actions;
}
