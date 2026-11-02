import type { SubTriggerEventName } from "#api/engine/effects/context/subTriggers";

const DIGIVOLUTION_TRASH_EVENTS: ReadonlySet<SubTriggerEventName> = new Set<SubTriggerEventName>([
  "onDigivolutionCardDiscarded",
  "onDigivolutionCardsDiscardedBatch",
  "onDigiBurstCardDiscarded",
  "whenDigivolutionTrashed",
]);

export function isDigivolutionTrashEvent(event: SubTriggerEventName): boolean {
  return DIGIVOLUTION_TRASH_EVENTS.has(event);
}
