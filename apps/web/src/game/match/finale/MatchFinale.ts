import type { Seat } from "@aegis/shared/schema/enums";

export type MatchFinaleAttacker = {
  permanentId: string;
  cardId: string;
  artId: string | undefined;
};

export type MatchFinale = {
  key: string;
  winnerSeat: Seat;
  attacker: MatchFinaleAttacker | undefined;
};
