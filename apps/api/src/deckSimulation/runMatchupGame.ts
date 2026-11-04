import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { MatchupGameResult } from "@aegis/shared/deckSimulation/MatchupGameResult";
import { createLevelBotOptions } from "#api/bot/levels/createLevelBotOptions";
import { defaultStyleForDeck } from "#api/bot/levels/defaultStyleForDeck";
import { runBotMatch, type MatchResult, type SeatConfig } from "#api/bot/matchHarness";
import { mainActionReady } from "#api/bot/training/actions";
import type { Decklist } from "#api/engine/setup";
import { MATCHUP_PLAYER_SEAT } from "#api/deckSimulation/MATCHUP_PLAYER_SEAT";
import type { MatchupGameOutcome } from "#api/deckSimulation/MatchupGameOutcome";

const MATCHUP_TURN_LIMIT = 60;
const MATCHUP_DECK_RULES = { betaBattleMode: true } as const;

type Params = {
  deck: Decklist;
  opponent: Decklist;
  seed: number;
  playerFirst: boolean;
  recordReplay: boolean;
  signal?: AbortSignal;
};

function isCleanGame(match: MatchResult): boolean {
  return (
    match.reason !== "stalled" &&
    match.reason !== "cancelled" &&
    match.errors.length === 0 &&
    match.rejections.length === 0 &&
    match.seats.every((seat) => seat.inferenceFallbacks.error === 0 && seat.inferenceFallbacks.timeout === 0)
  );
}

function standardSeat(deck: Decklist, seed: number): SeatConfig {
  const style = defaultStyleForDeck({ deck });
  return {
    deck,
    canChooseMainAction: (engine) => mainActionReady(engine),
    policyFactory: (engine, seat) =>
      createLevelBotOptions({
        engine,
        seat,
        deck,
        seed: seed + seat * 7919,
        difficulty: BotDifficulty.STANDARD.value,
        style,
      }).policy!,
  };
}

export async function runMatchupGame({
  deck,
  opponent,
  seed,
  playerFirst,
  recordReplay,
  signal,
}: Params): Promise<MatchupGameOutcome> {
  const match = await runBotMatch({
    seed,
    firstSeat: playerFirst ? MATCHUP_PLAYER_SEAT : 1,
    seats: [standardSeat(deck, seed), standardSeat(opponent, seed)],
    turnLimit: MATCHUP_TURN_LIMIT,
    recordReplay,
    deckRules: MATCHUP_DECK_RULES,
    headless: true,
    signal,
  });
  const result = !isCleanGame(match)
    ? undefined
    : match.winnerSeat === undefined
      ? MatchupGameResult.DRAW.value
      : match.winnerSeat === MATCHUP_PLAYER_SEAT
        ? MatchupGameResult.WIN.value
        : MatchupGameResult.LOSS.value;
  return {
    result,
    reason: match.reason,
    turns: match.turnCount,
    ...(recordReplay && match.replay !== undefined ? { replay: match.replay } : {}),
  };
}
