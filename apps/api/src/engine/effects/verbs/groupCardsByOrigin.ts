import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { MoveOrigin } from "#api/engine/effects/verbs/MoveOrigin";

type Params = {
  origins: ReadonlyMap<string, MoveOrigin>;
  cards: readonly CardInstance[];
  collapseIntoHost?: ReadonlyMap<string, MoveOrigin>;
};

type OriginGroup = MoveOrigin & { cards: CardInstance[] };

export function groupCardsByOrigin({ origins, cards, collapseIntoHost }: Params): OriginGroup[] {
  const groups: OriginGroup[] = [];
  for (const card of cards) {
    let origin = origins.get(card.instanceId) ?? { from: CardMovePosition.VARIOUS.value };
    if (origin.fromHost) {
      origin = collapseIntoHost?.get(origin.fromHost.permanentId) ?? origin;
    }
    const last = groups.at(-1);
    if (
      last &&
      last.from === origin.from &&
      last.fromSeat === origin.fromSeat &&
      last.fromHost?.permanentId === origin.fromHost?.permanentId &&
      last.fromHost?.hostCardId === origin.fromHost?.hostCardId &&
      last.fromSecurityCheck === origin.fromSecurityCheck &&
      last.cards[0]?.ownerSeat === card.ownerSeat
    ) {
      last.cards.push(card);
    } else {
      groups.push({ ...origin, cards: [card] });
    }
  }
  return groups;
}
