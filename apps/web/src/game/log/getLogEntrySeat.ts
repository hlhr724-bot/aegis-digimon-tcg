import type { Seat } from "@aegis/shared/schema/enums";
import type { LogEntry } from "@/game/log/LogEntry";

type Params = { entry: Pick<LogEntry, "kind" | "actorSeat">; viewerSeat?: Seat };

export function getLogEntrySeat({ entry, viewerSeat = 0 }: Params): Seat | undefined {
  if (entry.actorSeat !== undefined) {
    return entry.actorSeat;
  }
  if (entry.kind === "you") {
    return viewerSeat;
  }
  if (entry.kind === "opp") {
    return viewerSeat === 0 ? 1 : 0;
  }
  return undefined;
}
