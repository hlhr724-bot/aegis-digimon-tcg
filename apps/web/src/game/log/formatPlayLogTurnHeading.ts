import type { Seat } from "@aegis/shared/schema/enums";
import type { SeatNames } from "@/game/log/SeatNames";
import type { Translate } from "@/i18n/translationTypes";

type Params = { turnCount: number; turnSeat: Seat; playerNames: SeatNames; t: Translate };

export function formatPlayLogTurnHeading({ turnCount, turnSeat, playerNames, t }: Params): string {
  return t("feed.turnHeading", { turn: turnCount, player: playerNames[turnSeat] });
}
