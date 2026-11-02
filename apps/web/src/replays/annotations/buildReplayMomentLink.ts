import { replayLink } from "@/replays/library";

export const REPLAY_MOMENT_PARAM = "at";

type Params = { replayId: string; index: number };

export function buildReplayMomentLink({ replayId, index }: Params): string {
  const url = new URL(replayLink(replayId));
  url.searchParams.set(REPLAY_MOMENT_PARAM, String(index + 1));
  return url.href;
}
