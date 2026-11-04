import { REPLAY_MOMENT_PARAM } from "@/replays/annotations/buildReplayMomentLink";

export function readReplayMomentIndex(search: string): number | undefined {
  const value = new URLSearchParams(search).get(REPLAY_MOMENT_PARAM);
  if (!value || !/^\d{1,5}$/.test(value)) {
    return undefined;
  }
  const action = Number(value);
  return action >= 1 ? action - 1 : undefined;
}
