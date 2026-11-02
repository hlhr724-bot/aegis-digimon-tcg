import type { DecisionRequest } from "@aegis/shared";
import type { ServerBatch } from "../../../net/serverBatches";
import type { NarrationItem } from "../../narration";

/** Results already emitted before the question still need their original announcement. */
export function hasEarlierClauseResults(
  item: NarrationItem,
  decision: DecisionRequest,
  batches: readonly ServerBatch[],
): boolean {
  const body = item.notice?.body;
  if (body?.variant !== "effect") return false;
  const start = batches.findIndex((batch) => batch.id === item.batchId);
  if (start < 0) return true;
  let found = false;
  for (const batch of batches.slice(start)) {
    if (batch.id !== item.batchId && decision.stateVersion !== undefined && batch.stateVersion > decision.stateVersion)
      break;
    for (const event of batch.events) {
      if (!found) {
        if (
          event.kind !== "effectTriggered" &&
          event.kind !== "effectOptionChosen" &&
          event.kind !== "effectClauseAdvanced"
        ) {
          continue;
        }
        if (event.sourceCardId !== body.cardId) continue;
        if (body.sourceInstanceId && event.sourceInstanceId !== body.sourceInstanceId) continue;
        if (body.sourcePermanentId && event.sourcePermanentId !== body.sourcePermanentId) continue;
        found =
          body.effectTextPart !== undefined
            ? (event.kind === "effectOptionChosen" || event.kind === "effectClauseAdvanced") &&
              event.clause === body.effectTextPart
            : event.kind === "effectTriggered" && (!body.effectKey || event.effectKey === body.effectKey);
        continue;
      }
      if (event.kind !== "batchClosed") return true;
    }
  }
  return false;
}
