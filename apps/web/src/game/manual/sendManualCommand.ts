import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import type { AegisRoom } from "@/net/client";
import { sendIntent } from "@/net/client";

type Params = { room: AegisRoom; command: ManualCommand };

export function sendManualCommand({ room, command }: Params): void {
  sendIntent(room, { type: "manual", requestId: crypto.randomUUID(), revision: room.state.manual.revision, command });
}
