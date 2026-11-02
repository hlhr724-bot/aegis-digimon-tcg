import type { ActiveMatch } from "@aegis/shared/protocol/ActiveMatch";
import type { RoomSlot } from "@/net/client";

export type ResumableMatch = ActiveMatch & {
  slot: RoomSlot;
};
