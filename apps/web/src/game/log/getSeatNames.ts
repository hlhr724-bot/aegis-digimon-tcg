import type { Seat } from "@aegis/shared/schema/enums";
import type { SeatNames } from "@/game/log/SeatNames";
import type { Translate } from "@/i18n/translationTypes";

type Params = {
  players: ReadonlyArray<{ displayName?: string } | undefined>;
  viewerSeat?: Seat;
  replayPlayers?: readonly string[];
  t: Translate;
};

export function getSeatNames({ players, viewerSeat, replayPlayers, t }: Params): SeatNames {
  function getName(seat: Seat): string {
    const name = players[seat]?.displayName?.trim() || replayPlayers?.[seat]?.trim();
    if (name) {
      return name;
    }
    if (viewerSeat === undefined) {
      return t("log.player", { n: seat + 1 });
    }
    return t(seat === viewerSeat ? "game.you" : "game.opponent");
  }
  return { 0: getName(0), 1: getName(1) };
}
