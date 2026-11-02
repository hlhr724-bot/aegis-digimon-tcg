import type { Seat } from "@aegis/shared/schema/enums";

export type LenderCardSourcePayload = {
  instanceId: string;
  cardId: string;
  ownerSeat: Seat;
  permanentId: string;
};
