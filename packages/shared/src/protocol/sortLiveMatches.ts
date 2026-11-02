import type { LiveMatch } from "./LiveMatch.js";

export function sortLiveMatches(matches: LiveMatch[]): LiveMatch[] {
  return [...matches].sort(
    (first, second) => second.spectators - first.spectators || second.startedAt - first.startedAt,
  );
}
