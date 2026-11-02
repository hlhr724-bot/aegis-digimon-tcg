import { deckFormat, formatIsUnlimited } from "@aegis/shared/deckFormat";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { matchBestOf } from "@aegis/shared/matchFormat";
import { MatchQueue } from "@aegis/shared/matchmaking/MatchQueue";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import type { AegisJoinOptions } from "@/net/types";

type QueueOptions = Pick<
  AegisJoinOptions,
  "gameMode" | "ranked" | "betaBattleMode" | "format" | "unlimited" | "matchTimer" | "bestOf" | "allowRollback"
>;

type Params = {
  options: QueueOptions;
};

type QueueParams = {
  options: QueueOptions;
  unlimited: boolean;
};

function getQueue({ options, unlimited }: QueueParams): MatchQueue {
  if (options.gameMode === GameMode.MANUAL.value) {
    return MatchQueue.MANUAL.value;
  }
  if (options.ranked) {
    return MatchQueue.RANKED.value;
  }
  if (unlimited) {
    return MatchQueue.UNLIMITED.value;
  }
  if (options.betaBattleMode) {
    return MatchQueue.BETA.value;
  }
  return MatchQueue.CASUAL.value;
}

export function getMatchQueueSelection({ options }: Params): MatchQueueSelection {
  const format = deckFormat(options.format, options.unlimited);
  return {
    queue: getQueue({ options, unlimited: formatIsUnlimited(format) }),
    format,
    matchTimer: options.matchTimer === true,
    bestOf: matchBestOf(options.bestOf),
    allowRollback: options.allowRollback === true,
  };
}
