import type { ServerEvent } from "@aegis/shared/protocol/events";

export function splitLogEvent(event: ServerEvent): readonly ServerEvent[] {
  if (event.kind !== "cardsMoved" || event.deckReturnOrder !== undefined) {
    return [event];
  }
  const permanents = [
    ...(event.deletedPermanents ?? []).map((permanent) => ({ deletedPermanents: [permanent] })),
    ...(event.returnedPermanents ?? []).map((permanent) => ({ returnedPermanents: [permanent] })),
    ...(event.trashedPermanents ?? []).map((permanent) => ({ trashedPermanents: [permanent] })),
  ];
  if (permanents.length <= 1) {
    return [event];
  }
  return permanents.map((permanent) => ({
    ...event,
    deletedPermanents: undefined,
    returnedPermanents: undefined,
    trashedPermanents: undefined,
    ...permanent,
  }));
}
