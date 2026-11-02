import type { Seat, Zone } from "@aegis/shared/schema/enums";
import type { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";

export type MoveOrigin = {
  from: Zone | CardMovePosition;
  fromSeat?: Seat;
  fromHost?: { permanentId: string; hostCardId: string };
  fromSecurityCheck?: true;
};
