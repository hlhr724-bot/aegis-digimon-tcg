import { dnaDigivolutionRequirementsFor, type Seat } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import { validateDnaDigivolve, validateLinkCard } from "../../engine/actions/index.js";
import { dnaDigivolveDeps, linkCardDeps } from "../../engine/gameEngine/actionDeps.js";
import { validateAppFusion } from "../../engine/gameEngine/intents/play.js";
import type { TrainingAction } from "./actions.js";

/** Ordered tuples preserve DNA stack order and which material supplies cost adjustments. */
function* orderedMaterials(ids: readonly string[], count: number): Generator<string[]> {
  if (count === 0) {
    yield [];
    return;
  }
  for (const id of ids) {
    for (const rest of orderedMaterials(
      ids.filter((other) => other !== id),
      count - 1,
    ))
      yield [id, ...rest];
  }
}

/** Specialized declarations share the engine's player validators, including live restrictions. */
export function specialMainActions(engine: GameEngine, seat: Seat): TrainingAction[] {
  const player = engine.state.players[seat]!;
  const actions: TrainingAction[] = [];
  const dnaDeps = dnaDigivolveDeps(engine);
  const linkDeps = linkCardDeps(engine);
  const ids = Array.from(player.battleArea, ({ permanentId }) => permanentId);
  for (const card of player.hand) {
    const counts = new Set(
      dnaDigivolutionRequirementsFor(card.cardId).map((requirement) => requirement.materials.length),
    );
    for (const count of counts) {
      for (const materialPermanentIds of orderedMaterials(ids, count)) {
        const intent = { type: "dnaDigivolve" as const, instanceId: card.instanceId, materialPermanentIds };
        const check = validateDnaDigivolve(engine.state, seat, intent, dnaDeps);
        if (check.ok)
          actions.push({
            intent,
            label: "DNA digivolve",
            sourceId: card.instanceId,
            targetId: materialPermanentIds[0],
            materialIds: materialPermanentIds,
            projectedCost: check.cost,
          });
      }
    }
    for (const host of player.battleArea) {
      for (const linked of host.linked) {
        const intent = {
          type: "appFusion" as const,
          instanceId: card.instanceId,
          permanentId: host.permanentId,
          linkedInstanceId: linked.instanceId,
        };
        const check = validateAppFusion(engine, seat, intent);
        if (check.ok)
          actions.push({
            intent,
            label: "App Fusion",
            sourceId: card.instanceId,
            targetId: host.permanentId,
            materialIds: [linked.instanceId],
            projectedCost: check.projectedCost,
          });
      }
    }
  }
  const sources = [...player.hand, ...Array.from(player.battleArea, (permanent) => permanent.topCard)];
  for (const source of sources) {
    if (source === undefined) continue;
    for (const target of player.battleArea) {
      const intent = {
        type: "linkCard" as const,
        instanceId: source.instanceId,
        targetPermanentId: target.permanentId,
      };
      const check = validateLinkCard(engine.state, seat, intent, linkDeps);
      if (check.ok)
        actions.push({
          intent,
          label: "Link card",
          ...(check.sourcePermanent === undefined ? {} : { materialIds: [check.sourcePermanent.permanentId] }),
          sourceId: source.instanceId,
          targetId: target.permanentId,
          projectedCost: check.cost,
        });
    }
  }
  return actions;
}
