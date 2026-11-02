import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import { Zone } from "@aegis/shared/schema/enums";
import { getLogCardName } from "@/game/log/getLogCardName";
import type { Seat } from "@aegis/shared/schema/enums";
import type { SeatNames } from "@/game/log/SeatNames";
import type { Translate, TranslationKey } from "@/i18n/translationTypes";

type Params = { zone: string; seat?: Seat; hostCardId?: string; viewerSeat?: Seat; seatNames: SeatNames; t: Translate };

const zoneKeys: Record<string, TranslationKey> = {
  [Zone.Deck]: "log.zone.deck",
  [CardMovePosition.DECK_TOP.value]: "log.zone.deckTop",
  [CardMovePosition.DECK_BOTTOM.value]: "log.zone.deckBottom",
  [Zone.Hand]: "log.zone.hand",
  [Zone.BattleArea]: "log.zone.battleArea",
  play: "log.zone.battleArea",
  [Zone.Breeding]: "log.zone.breeding",
  [Zone.Security]: "log.zone.security",
  [Zone.Trash]: "log.zone.trash",
  [Zone.EggDeck]: "log.zone.eggDeck",
  delay: "log.zone.delay",
  [CardMovePosition.UNDER_TAMER.value]: "log.zone.underTamer",
  [CardMovePosition.VARIOUS.value]: "log.zone.various",
  [CardMovePosition.LINKED_CARDS.value]: "log.zone.linkedCards",
  [CardMovePosition.DIGIVOLUTION_CARDS.value]: "log.zone.digivolutionCards",
  [CardMovePosition.RESOLVING_OPTION.value]: "log.zone.resolvingOption",
  [CardMovePosition.SUSPENDED.value]: "log.zone.suspended",
  [CardMovePosition.UNSUSPENDED.value]: "log.zone.unsuspended",
};

export function describeZone({ zone, seat, hostCardId, viewerSeat, seatNames, t }: Params): string {
  if (hostCardId) {
    return t("log.zone.under", { card: getLogCardName({ cardId: hostCardId }) });
  }
  const key = zoneKeys[zone];
  const label = key ? t(key) : zone;
  if (
    seat === undefined ||
    zone === CardMovePosition.VARIOUS.value ||
    zone === CardMovePosition.SUSPENDED.value ||
    zone === CardMovePosition.UNSUSPENDED.value
  ) {
    return label;
  }
  if (seat === viewerSeat && seatNames[seat] === t("game.you")) {
    return t("log.zone.yours", { zone: label });
  }
  return t("log.zone.owned", { player: seatNames[seat], zone: label });
}
