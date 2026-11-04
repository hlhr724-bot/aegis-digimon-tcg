import type { ServerEvent } from "@aegis/shared/protocol/events";
import type { LogEffectDetail } from "@/game/log/LogEffectDetail";
import { noticeEffectClause, printedTimingLabel } from "@/game/overlay/effectText";

type Params = { event: Extract<ServerEvent, { kind: "effectTriggered" }> };

export function getLogEffectDetail({ event }: Params): LogEffectDetail {
  const timing = event.printedTiming ?? event.timing;
  const isInherited = event.isInherited === true;
  const clause = noticeEffectClause({
    cardId: event.sourceCardId,
    timing,
    description: event.description,
    effectTextPart: event.effectTextPart,
    isInherited,
  })?.trim();
  return {
    cardId: event.sourceCardId,
    timing,
    timingLabel: printedTimingLabel(timing),
    isInherited,
    clause: clause || undefined,
  };
}
