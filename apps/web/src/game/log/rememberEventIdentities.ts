import type { ServerEvent } from "@aegis/shared/protocol/events";

type Params = { identities: Map<string, string>; event: ServerEvent };

export function rememberEventIdentities({ identities, event }: Params): void {
  switch (event.kind) {
    case "cardPlayed":
      if (event.permanentId !== undefined) {
        identities.set(event.permanentId, event.cardId);
      }
      if (event.instanceId !== undefined) {
        identities.set(event.instanceId, event.cardId);
      }
      return;
    case "digivolved":
    case "hatched":
    case "movedFromBreeding":
      identities.set(event.permanentId, event.cardId);
      return;
    case "attackDeclared":
      identities.set(event.attackerPermanentId, event.attackerCardId);
      if (event.target.kind === "permanent" && event.targetCardId !== undefined) {
        identities.set(event.target.permanentId, event.targetCardId);
      }
      return;
    case "cardsMoved":
      for (const [index, instanceId] of event.instanceIds.entries()) {
        const cardId = event.cardIds?.[index];
        if (cardId !== undefined) {
          identities.set(instanceId, cardId);
        }
      }
      for (const permanent of [
        ...(event.deletedPermanents ?? []),
        ...(event.returnedPermanents ?? []),
        ...(event.trashedPermanents ?? []),
      ]) {
        identities.set(permanent.permanentId, permanent.cardId);
        identities.set(permanent.instanceId, permanent.cardId);
      }
      return;
    default:
      return;
  }
}
