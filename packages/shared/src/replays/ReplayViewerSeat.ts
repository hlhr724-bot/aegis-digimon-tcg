import type { Seat } from "#shared/schema/enums";
import type { SPECTATOR_REPLAY_SEAT } from "#shared/replays/spectatorReplaySeat";

export type ReplayViewerSeat = Seat | typeof SPECTATOR_REPLAY_SEAT;
