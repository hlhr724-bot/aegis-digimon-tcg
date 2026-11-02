import type { LedgerEntry, ParticipantKind, StandingsRow, TournamentRules } from "@aegis/shared";
import { rankStandingsRows } from "#api/tournaments/standings/rankStandingsRows";

// Standings are a pure projection of an immutable result ledger. Nothing here
// reads or writes mutable counters, a database, or a clock: the same ledger and
// the same ruleset always produce byte-identical rows.
//
// Ledger conventions this projection assumes (the ledger writer owns them, the
// projection only reads them):
//
// - one entry per participant per resolved match, so a two-player match writes
//   two entries (`win`/`loss`, `draw`/`draw`, `double_loss`/`double_loss`,
//   `concession` for the conceder and `win` for the opponent, `no_show_loss`
//   for the absentee and `win` for the player who showed up);
// - a bye writes a single entry with `opponentId: null` and `outcome: "bye"`;
// - `opponentKind` records what the opponent was (`human` or `bot`) and is
//   `null` exactly when `opponentId` is `null`.

// Tournament Rules Manual section 5.4: rates below 0.33 are treated as 0.33
// when they feed an opponent's average. Used only when the ruleset does not
// carry its own `standings.winRateFloor`.
export const MATCH_WIN_RATE_FLOOR = 0.33;

export type StandingsTiebreaker =
  // Match points, highest first. Implied first criterion; listing it is optional.
  | "points"
  // The participant's own floored match-win rate, byes excluded.
  | "match_win_rate"
  // Average of the opponents' floored match-win rates (OMW%).
  | "opponent_match_win_rate"
  // Average of the opponents' OMW% (OOMW%), used by the World Championship ruleset.
  | "opponent_opponent_match_win_rate"
  | "head_to_head"
  | "judge_random_draw"
  | "extra_match";

const RESOLVABLE_TIEBREAKERS = new Set<StandingsTiebreaker>([
  "points",
  "match_win_rate",
  "opponent_match_win_rate",
  "opponent_opponent_match_win_rate",
  "head_to_head",
  "judge_random_draw",
]);

const UNRESOLVABLE_TIEBREAKERS = new Set<StandingsTiebreaker>(["extra_match"]);

export class UnknownTiebreakerError extends Error {
  constructor(readonly tiebreaker: string) {
    super(
      `Unknown standings tiebreaker "${tiebreaker}". Known criteria: ${[
        ...RESOLVABLE_TIEBREAKERS,
        ...UNRESOLVABLE_TIEBREAKERS,
      ].join(", ")}.`,
    );
    this.name = "UnknownTiebreakerError";
  }
}

export type StandingsParticipant = {
  id: string;
  // Registration seed; participants without one sort after those with one.
  seed: number | null;
};

export type StandingsOptions = {
  // Whether bot opponents contribute to OMW%/OOMW%. They do NOT by default.
  //
  // A bot's own match-win rate is manufactured by this system, not earned in the
  // event, so letting it into an opponent average makes a tiebreaker partly a
  // function of how the fill happened to play — and whoever drew the bot carries
  // that noise into a placing that decides a Top Cut seat. Official presets do
  // not seat bots at all, so this only ever bites the casual events that do, and
  // there the honest reading is that a fill match padded the round rather than
  // measured a field.
  //
  // The bot match still counts everywhere it was really played: it consumes a
  // round, it scores points, and it moves the participant's OWN match-win rate.
  // Only the opponent-rate averages skip it. Set true for a ruleset that means
  // to count bots as ordinary opponents. Either way `botOpponentMatches` is
  // reported per participant and `botOpponentsIncluded` on the report, so the
  // choice is never invisible.
  includeBotOpponentsInOpponentRates?: boolean;
};

export type ComputeStandingsInput = {
  ledger: readonly LedgerEntry[];
  standings: TournamentRules["standings"];
  // Optional roster. Supply it so participants with an empty ledger (dropped
  // before round 1, or standings requested before any result) still get a row.
  // Omitted: the roster is derived from the ledger and every seed is null.
  participants?: readonly StandingsParticipant[];
  options?: StandingsOptions;
  drawSeed?: string;
};

export type StandingsDetailRow = StandingsRow & {
  seed: number | null;
  // Rounds that count toward the win rate, i.e. every round except byes.
  ratedRounds: number;
  // Match points earned in those rounds.
  ratedPoints: number;
  // `matchWinRate` on the base row is the raw rate. This is the same value
  // raised to the ruleset floor -- what the opponents' averages consume.
  flooredMatchWinRate: number;
  opponentOpponentMatchWinRate: number;
  // Matches against `kind: "bot"` opponents. Whether they fed the rates above
  // is `botOpponentsIncluded` on the report.
  botOpponentMatches: number;
  // Matches whose opponent appears in neither the ledger nor the roster, so it
  // has no rate to contribute. They are excluded from the opponent averages;
  // a non-zero count means the caller passed an incomplete roster or ledger.
  unratedOpponentMatches: number;
};

export type StandingsReport = {
  rows: StandingsDetailRow[];
  // Criteria from `standings.tiebreakers` that no projection can settle.
  unresolvedTiebreakers: StandingsTiebreaker[];
  botOpponentsIncluded: boolean;
};

type RatedOpponent = { id: string; kind: ParticipantKind | null };

type Accumulator = {
  id: string;
  seed: number | null;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  ratedRounds: number;
  ratedPoints: number;
  // Opponents of rated (non-bye) matches, one entry per match played: an
  // opponent met twice is listed twice and therefore weighs twice in OMW%.
  ratedOpponents: RatedOpponent[];
  botOpponentMatches: number;
};

function outcomePoints(outcome: LedgerEntry["outcome"], scoring: TournamentRules["standings"]): number {
  switch (outcome) {
    case "win":
      return scoring.winPoints;
    case "bye":
      return scoring.byePoints;
    case "draw":
      return scoring.drawPoints;
    case "loss":
    case "double_loss":
    case "no_show_loss":
    case "concession":
      return scoring.lossPoints;
  }
}

function isLossOutcome(outcome: LedgerEntry["outcome"]): boolean {
  return outcome === "loss" || outcome === "double_loss" || outcome === "no_show_loss" || outcome === "concession";
}

function parseTiebreakers(configured: readonly string[]): StandingsTiebreaker[] {
  return configured.map((tiebreaker) => {
    const candidate = tiebreaker as StandingsTiebreaker;
    if (RESOLVABLE_TIEBREAKERS.has(candidate) || UNRESOLVABLE_TIEBREAKERS.has(candidate)) {
      return candidate;
    }
    throw new UnknownTiebreakerError(tiebreaker);
  });
}

function emptyAccumulator(id: string, seed: number | null): Accumulator {
  return {
    id,
    seed,
    points: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    byes: 0,
    ratedRounds: 0,
    ratedPoints: 0,
    ratedOpponents: [],
    botOpponentMatches: 0,
  };
}

function collectAccumulators(input: ComputeStandingsInput): Map<string, Accumulator> {
  const accumulators = new Map<string, Accumulator>();
  for (const participant of input.participants ?? []) {
    accumulators.set(participant.id, emptyAccumulator(participant.id, participant.seed));
  }

  for (const entry of input.ledger) {
    let accumulator = accumulators.get(entry.participantId);
    if (!accumulator) {
      accumulator = emptyAccumulator(entry.participantId, null);
      accumulators.set(entry.participantId, accumulator);
    }

    const points = outcomePoints(entry.outcome, input.standings);
    accumulator.points += points;

    if (entry.outcome === "bye") {
      accumulator.byes += 1;
      continue;
    }

    accumulator.ratedRounds += 1;
    accumulator.ratedPoints += points;
    if (entry.opponentId !== null) {
      accumulator.ratedOpponents.push({ id: entry.opponentId, kind: entry.opponentKind });
    }
    if (entry.opponentKind === "bot") {
      accumulator.botOpponentMatches += 1;
    }

    if (entry.outcome === "win") accumulator.wins += 1;
    else if (entry.outcome === "draw") accumulator.draws += 1;
    else if (isLossOutcome(entry.outcome)) accumulator.losses += 1;
  }

  return accumulators;
}

// Manual section 5.4: match points without byes / (rounds played without byes x 3),
// where 3 is the points a win is worth. Reading the denominator from `winPoints`
// keeps a custom ruleset's scale consistent instead of hardcoding 3.
//
// Unfloored on purpose. The floor exists so that a crushed opponent does not
// drag their rivals' OMW% down; applying it to the player's own rate instead
// erases real differences between weak records -- 1 draw in 4 rounds (0.083)
// and 1 draw in 3 (0.111) would both read 0.33 and tie. The floor belongs on
// the values fed into the opponent averages, and nowhere else.
function rawMatchWinRate(accumulator: Accumulator, scoring: TournamentRules["standings"]): number {
  const maximumPerRound = scoring.winPoints;
  if (accumulator.ratedRounds === 0 || maximumPerRound <= 0) return 0;
  return accumulator.ratedPoints / (accumulator.ratedRounds * maximumPerRound);
}

type OpponentAverage = { rate: number; unratedMatches: number };

function averageOfOpponents(
  accumulator: Accumulator,
  accumulators: Map<string, Accumulator>,
  includeBots: boolean,
  floor: number,
  rateOf: (opponent: Accumulator) => number,
): OpponentAverage {
  let total = 0;
  let counted = 0;
  let unratedMatches = 0;
  for (const ratedOpponent of accumulator.ratedOpponents) {
    if (!includeBots && ratedOpponent.kind === "bot") continue;
    const opponent = accumulators.get(ratedOpponent.id);
    // An opponent absent from both the ledger and the roster cannot be rated.
    // It is skipped rather than scored as a floor, so a data gap never silently
    // deflates someone's tiebreaker -- and counted, so it is never invisible.
    if (!opponent) {
      unratedMatches += 1;
      continue;
    }
    total += rateOf(opponent);
    counted += 1;
  }
  // No rated opponent (all byes, or every opponent excluded) resolves to the
  // floor, the same value a winless opponent would contribute.
  return { rate: counted === 0 ? floor : total / counted, unratedMatches };
}

export function computeStandingsReport(input: ComputeStandingsInput): StandingsReport {
  const tiebreakers = parseTiebreakers(input.standings.tiebreakers);
  const includeBots = input.options?.includeBotOpponentsInOpponentRates ?? false;
  // The floor is ruleset data, not a constant: presets carry it so an event can
  // be run under a different one without editing this module.
  const floor = input.standings.winRateFloor ?? MATCH_WIN_RATE_FLOOR;
  const accumulators = collectAccumulators(input);

  const matchWinRates = new Map<string, number>();
  const flooredRates = new Map<string, number>();
  for (const [id, accumulator] of accumulators) {
    const rate = rawMatchWinRate(accumulator, input.standings);
    matchWinRates.set(id, rate);
    flooredRates.set(id, Math.max(floor, rate));
  }

  const opponentMatchWinRates = new Map<string, number>();
  const unratedOpponentMatches = new Map<string, number>();
  for (const [id, accumulator] of accumulators) {
    const average = averageOfOpponents(
      accumulator,
      accumulators,
      includeBots,
      floor,
      (opponent) => flooredRates.get(opponent.id) ?? floor,
    );
    opponentMatchWinRates.set(id, average.rate);
    unratedOpponentMatches.set(id, average.unratedMatches);
  }

  const opponentOpponentMatchWinRates = new Map<string, number>();
  for (const [id, accumulator] of accumulators) {
    opponentOpponentMatchWinRates.set(
      id,
      averageOfOpponents(
        accumulator,
        accumulators,
        includeBots,
        floor,
        (opponent) => opponentMatchWinRates.get(opponent.id) ?? floor,
      ).rate,
    );
  }

  const rows = [...accumulators.values()].map((accumulator) => ({
    participantId: accumulator.id,
    rank: 0,
    points: accumulator.points,
    matchWinRate: matchWinRates.get(accumulator.id) ?? 0,
    flooredMatchWinRate: flooredRates.get(accumulator.id) ?? floor,
    opponentMatchWinRate: opponentMatchWinRates.get(accumulator.id) ?? floor,
    opponentOpponentMatchWinRate: opponentOpponentMatchWinRates.get(accumulator.id) ?? floor,
    wins: accumulator.wins,
    losses: accumulator.losses,
    draws: accumulator.draws,
    byes: accumulator.byes,
    seed: accumulator.seed,
    ratedRounds: accumulator.ratedRounds,
    ratedPoints: accumulator.ratedPoints,
    botOpponentMatches: accumulator.botOpponentMatches,
    unratedOpponentMatches: unratedOpponentMatches.get(accumulator.id) ?? 0,
  }));

  const ranked = rankStandingsRows({ rows, ledger: input.ledger, tiebreakers, drawSeed: input.drawSeed ?? "" });
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });

  return {
    rows: ranked,
    unresolvedTiebreakers: tiebreakers.filter((tiebreaker) => UNRESOLVABLE_TIEBREAKERS.has(tiebreaker)),
    botOpponentsIncluded: includeBots,
  };
}

export function computeStandings(input: ComputeStandingsInput): StandingsRow[] {
  return computeStandingsReport(input).rows.map((row) => ({
    participantId: row.participantId,
    rank: row.rank,
    points: row.points,
    matchWinRate: row.matchWinRate,
    opponentMatchWinRate: row.opponentMatchWinRate,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    byes: row.byes,
  }));
}
