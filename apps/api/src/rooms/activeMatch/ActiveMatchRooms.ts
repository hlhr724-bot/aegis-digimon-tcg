import type { ActiveMatch } from "@aegis/shared/protocol/ActiveMatch";
import type { ActiveMatchClaim } from "@aegis/shared/protocol/ActiveMatchClaim";

type SeatOwnerParams = { roomId: string; accountId: string };

export type ActiveMatchRooms = {
  findSeat: (params: SeatOwnerParams) => Promise<ActiveMatch | null>;
  transferSeat: (params: SeatOwnerParams) => Promise<ActiveMatchClaim | null>;
};
