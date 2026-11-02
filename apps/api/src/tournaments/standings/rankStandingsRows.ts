import type { LedgerEntry } from "@aegis/shared";
import { createDeterministicRandom, shuffle } from "#api/tournaments/pairing/deterministicRandom";
import type { StandingsDetailRow, StandingsTiebreaker } from "#api/tournaments/standings/computeStandings";

type Params = {
  rows: readonly StandingsDetailRow[];
  ledger: readonly LedgerEntry[];
  tiebreakers: readonly StandingsTiebreaker[];
  drawSeed: string;
};

type TieGroup = StandingsDetailRow[];

type WinsByPair = Map<string, Map<string, number>>;

type SplitParams = {
  group: TieGroup;
  tiebreaker: StandingsTiebreaker;
  winsByPair: WinsByPair;
  drawSeed: string;
};

type BeatenParams = {
  winnerId: string;
  loserId: string;
  winsByPair: WinsByPair;
};

export function rankStandingsRows({ rows, ledger, tiebreakers, drawSeed }: Params): StandingsDetailRow[] {
  const winsByPair = countWinsByPair(ledger);
  const chain: StandingsTiebreaker[] = ["points", ...tiebreakers];
  let groups: TieGroup[] = [[...rows].sort(compareBySeedThenId)];
  for (const tiebreaker of chain) {
    groups = groups.flatMap((group) => splitGroup({ group, tiebreaker, winsByPair, drawSeed }));
  }
  return groups.flat();
}

function splitGroup({ group, tiebreaker, winsByPair, drawSeed }: SplitParams): TieGroup[] {
  if (group.length < 2) {
    return [group];
  }
  switch (tiebreaker) {
    case "points":
      return splitByValue(group, (row) => row.points);
    case "match_win_rate":
      return splitByValue(group, (row) => row.matchWinRate);
    case "opponent_match_win_rate":
      return splitByValue(group, (row) => row.opponentMatchWinRate);
    case "opponent_opponent_match_win_rate":
      return splitByValue(group, (row) => row.opponentOpponentMatchWinRate);
    case "head_to_head":
      return splitByHeadToHead(group, winsByPair);
    case "judge_random_draw":
      return drawGroup(group, drawSeed);
    case "extra_match":
      return [group];
  }
}

function splitByValue(group: TieGroup, getValue: (row: StandingsDetailRow) => number): TieGroup[] {
  const sorted = [...group].sort((left, right) => getValue(right) - getValue(left));
  const groups: TieGroup[] = [];
  let current: TieGroup = [];
  let currentValue: number | null = null;
  for (const row of sorted) {
    const value = getValue(row);
    if (value !== currentValue) {
      current = [];
      groups.push(current);
      currentValue = value;
    }
    current.push(row);
  }
  return groups;
}

function splitByHeadToHead(group: TieGroup, winsByPair: WinsByPair): TieGroup[] {
  const groups: TieGroup[] = [];
  let remaining = group;
  while (remaining.length > 1) {
    const leader = findHeadToHeadLeader(remaining, winsByPair);
    if (!leader) {
      break;
    }
    groups.push([leader]);
    remaining = remaining.filter((row) => row !== leader);
  }
  groups.push(remaining);
  return groups;
}

function findHeadToHeadLeader(group: TieGroup, winsByPair: WinsByPair): StandingsDetailRow | undefined {
  return group.find((candidate) =>
    group.every(
      (other) =>
        other === candidate ||
        hasBeaten({ winnerId: candidate.participantId, loserId: other.participantId, winsByPair }),
    ),
  );
}

function hasBeaten({ winnerId, loserId, winsByPair }: BeatenParams): boolean {
  const wins = winsByPair.get(winnerId)?.get(loserId) ?? 0;
  const losses = winsByPair.get(loserId)?.get(winnerId) ?? 0;
  return wins > losses;
}

function countWinsByPair(ledger: readonly LedgerEntry[]): WinsByPair {
  const winsByPair: WinsByPair = new Map();
  for (const entry of ledger) {
    if (entry.outcome !== "win" || entry.opponentId === null) {
      continue;
    }
    const opponents = winsByPair.get(entry.participantId) ?? new Map<string, number>();
    opponents.set(entry.opponentId, (opponents.get(entry.opponentId) ?? 0) + 1);
    winsByPair.set(entry.participantId, opponents);
  }
  return winsByPair;
}

function drawGroup(group: TieGroup, drawSeed: string): TieGroup[] {
  const byId = [...group].sort(compareById);
  const random = createDeterministicRandom(`${drawSeed}:${byId.map((row) => row.participantId).join(",")}`);
  return shuffle(byId, random).map((row) => [row]);
}

function compareById(left: StandingsDetailRow, right: StandingsDetailRow): number {
  if (left.participantId === right.participantId) {
    return 0;
  }
  return left.participantId < right.participantId ? -1 : 1;
}

function compareBySeedThenId(left: StandingsDetailRow, right: StandingsDetailRow): number {
  if (left.seed !== right.seed) {
    if (left.seed === null) {
      return 1;
    }
    if (right.seed === null) {
      return -1;
    }
    return left.seed - right.seed;
  }
  return compareById(left, right);
}
