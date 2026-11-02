import { playsScoredRounds } from "@aegis/shared/tournaments/playsScoredRounds";
import type { PhaseKind, TournamentRules } from "@aegis/shared";

/**
 * Which of a ruleset's three clocks a confrontation runs on.
 *
 * The snapshot carries `swissDurationMs`, `topCutDurationMs` and `finalDurationMs`, and nothing in
 * the ruleset says which applies — that is a property of the MATCH, not of the rules. This module
 * is the one place that decides, so the presence endpoint, the bot sweep and the deadline scheduler
 * cannot answer the question three subtly different ways and start the same confrontation under two
 * different clocks depending on who arrived first.
 */
export type MatchClockContext = {
  /** The phase the match belongs to, or `null` for the legacy bracket, which has no phases. */
  phaseKind: PhaseKind | null;
  /** True only for the deciding match of a bracket phase. */
  isFinal: boolean;
  /** The event's structure, which stands in when there is no phase to read. */
  structure: string;
};

/**
 * How long a confrontation runs before its deadline fires: the phase's round clock PLUS the
 * ruleset's overtime.
 *
 * `null` means untimed — the official preset's final is exactly that, and `SeriesStore` supports it
 * by queuing no deadline and replaying drawn games until one decides.
 *
 * The bracket branch falls back from the cut clock to the final's rather than to the Swiss one: a
 * plain single-elimination event has no Swiss phase at all, so its rounds are elimination rounds and
 * the Swiss clock would be borrowed from a format it never runs.
 *
 * **Why overtime is folded in here.** Manual §5.2 gives a round its time and then a fixed number of
 * further turns; the deadline this feeds (`SeriesStore.createSeries` → `now + duration`) is the
 * instant the confrontation is DECIDED, not the instant the main clock stops. Returning the round
 * clock alone would settle a 45-minute Swiss round at 45 minutes and skip the extra turns entirely.
 * Adding `overtimeMs` puts the decision at 45 + 5, which is where the manual puts it.
 *
 * What is NOT modelled here is what happens INSIDE those five minutes: turn 0 plus three or five
 * extra turns, and the elimination state-tiebreak chain, are in-game semantics the room does not yet
 * expose. Per the plan's risk section, an elimination confrontation that reaches the deadline tied
 * still escalates to `needs_organizer_decision` rather than being settled by a metric nobody can
 * read. This function only decides WHEN the question is asked.
 */
export function seriesDurationFor(rules: TournamentRules | null, context: MatchClockContext): number | null {
  const match = rules?.match;
  if (!match) return null;
  const kind =
    context.phaseKind ?? (context.structure && playsScoredRounds(context.structure) ? "swiss" : "single_elimination");
  const base =
    kind === "swiss"
      ? match.swissDurationMs
      : context.isFinal
        ? match.finalDurationMs
        : (match.topCutDurationMs ?? match.finalDurationMs);
  return base === null ? null : base + match.overtimeMs;
}
