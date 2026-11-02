import type { Seat } from "#shared/schema/enums";

export type ActiveMatch = {
  roomId: string;
  seat: Seat;
  reconnectGraceMs?: number;
};
