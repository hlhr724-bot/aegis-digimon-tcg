import { Zone } from "@aegis/shared/schema/enums";
import type { ServerEvent } from "@aegis/shared/protocol/events";

export function hasUnsupportedReplayKnowledge(event: ServerEvent): boolean {
  if (event.kind === "cardRevealed" || event.kind === "securityRevealed") {
    return true;
  }
  if (event.kind !== "cardsMoved") {
    return false;
  }
  return event.to === Zone.Deck || event.to === Zone.Security || (event.to === Zone.Hand && event.from !== Zone.Deck);
}
