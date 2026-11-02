import type { Seat } from "@aegis/shared/schema/enums";
import type { ReplayTimelineEventKind } from "@/replays/ReplayTimelineEventKind";

export type ReplayTimelineEvent = {
  index: number;
  kind: ReplayTimelineEventKind;
  seat: Seat;
  turn: number;
  amount: number;
};
