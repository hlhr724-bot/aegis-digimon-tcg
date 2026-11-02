import { CardKind, getCardDefinition, type PlayerState } from "@aegis/shared";
import { appFusionRoutesForHost, handCardEvolutionRoute } from "../../digivolveModel";
import type { HandEntry } from "../../piece";
import { dragIntentFor, type DragIntent, type DropTarget } from "../../dragIntents";
import { DragKind } from "../enums";
import type { DragState, DropZoneHit } from "../types";
import { digivolveTargetsOf } from "./eligibility";
import { canAttackWith } from "../../boardModel";

/** A card can leave its slot only when at least one projected drop action is available. */
export function canDragCard(input: { drag: DragState; you: PlayerState; handEntries: readonly HandEntry[] }): boolean {
  const { drag, you, handEntries } = input;
  if (drag.kind === DragKind.Attack) {
    const attacker = you.battleArea.find((permanent) => permanent.permanentId === drag.permanentId);
    return attacker?.topCard.cardId === drag.cardId && canAttackWith(attacker);
  }
  const held = { ...drag, started: true };
  const targets: DropZoneHit[] = [
    { target: "battle-you" },
    { target: "breeding-you" },
    ...you.battleArea.map((permanent) => ({ target: "perm-you" as const, id: permanent.permanentId })),
  ];
  return targets.some((hit) => dragIntentAt({ hit, drag: held, you, handEntries }) !== null);
}

/**
 * What releasing here would do, or null where the drop would be refused. Every
 * answer is the server's projection read back through `dragIntents.ts`; the
 * board only paints it.
 */
export function dragIntentAt(input: {
  hit: DropZoneHit | null;
  drag: DragState | null;
  you: PlayerState;
  handEntries: readonly HandEntry[];
}): DragIntent | null {
  const { hit, drag, you, handEntries } = input;
  if (!hit || !drag?.started) return null;
  if (drag.kind === DragKind.Attack) {
    const attacker = you.battleArea.find((p) => p.permanentId === drag.permanentId);
    return dragIntentFor({
      drag: { kind: DragKind.Attack },
      target: hit.target,
      canAttackPlayer: attacker?.canAttackPlayer === true,
      attackable: hit.id !== undefined && attacker?.attackablePermanentIds.includes(hit.id) === true,
    });
  }
  const entry = handEntries.find((card) => card.instanceId === drag.instanceId);
  if (!entry || entry.cardId !== drag.cardId) return null;
  const definition = getCardDefinition(entry.cardId);
  const held = {
    kind: DragKind.Play as const,
    isOption: definition?.kinds.includes(CardKind.Option) ?? false,
    isDigiEgg: definition?.kinds.includes(CardKind.DigiEgg) ?? false,
    playable: entry.playableFromHand || !!entry.negamonPlayEffectKey,
  };
  const base = hit.target === "perm-you" ? you.battleArea.find((p) => p.permanentId === hit.id) : undefined;
  const route = base
    ? handCardEvolutionRoute(
        drag.cardId,
        you.battleArea,
        digivolveTargetsOf({ handEntries, instanceId: drag.instanceId }).includes(hit.id ?? ""),
        entry.dnaDigivolveRoutes,
        base.permanentId,
      )
    : undefined;
  const appFusion = base ? appFusionRoutesForHost(entry.appFusionRoutes ?? [], base).length > 0 : false;
  return dragIntentFor({
    drag: held,
    target: hit.target,
    evolutionRoute: appFusion ? "normal" : route?.kind,
    digivolvable:
      !!you.breeding &&
      digivolveTargetsOf({ handEntries, instanceId: drag.instanceId }).includes(you.breeding.permanentId),
  });
}

/** The `data-drag-intent` an area wears while it would accept the card in the air. */
export function dropIntentAttrs(input: {
  target: DropTarget;
  id?: string;
  drag: DragState | null;
  you: PlayerState;
  handEntries: readonly HandEntry[];
}): Record<string, string> {
  const { target, id, drag, you, handEntries } = input;
  const intent = dragIntentAt({ hit: { target, id }, drag, you, handEntries });
  return intent ? { "data-drag-intent": intent } : {};
}

/** The `data-drag-intent` an own permanent wears: only while it is a base for the drag. */
export function baseDropIntentAttrs(input: {
  permanentId: string;
  dragBasePermanentIds: ReadonlySet<string>;
  drag: DragState | null;
  you: PlayerState;
  handEntries: readonly HandEntry[];
}): Record<string, string> {
  const { permanentId, dragBasePermanentIds, drag, you, handEntries } = input;
  return dragBasePermanentIds.has(permanentId)
    ? dropIntentAttrs({ target: "perm-you", id: permanentId, drag, you, handEntries })
    : {};
}
