import { isBotDifficulty } from "@aegis/shared/bot/isBotDifficulty";
import { isBotStyle } from "@aegis/shared/bot/isBotStyle";
import type { Seat } from "@aegis/shared/schema/enums";
import { createBotArmOptions } from "#api/bot/experiment/createBotArmOptions";
import { BotArm } from "#api/bot/experiment/BotArm";
import { defaultBotOptions } from "#api/bot/defaultBotOptions";
import { validEvolutionGame } from "#api/bot/evolution/evolutionMatch";
import { BotReference } from "#api/bot/levels/BotReference";
import { isBotReference } from "#api/bot/levels/isBotReference";
import { BOT_LEVEL_CONFIGS } from "#api/bot/levels/BOT_LEVEL_CONFIGS";
import { createLevelBotOptions } from "#api/bot/levels/createLevelBotOptions";
import { LEVEL_SEARCH_POLICY_TIMEOUT_MS } from "#api/bot/levels/LEVEL_SEARCH_POLICY_TIMEOUT_MS";
import type { LevelSearchTiming } from "#api/bot/levels/LevelSearchTiming";
import { prewarmLiveSearchWorkers } from "#api/bot/search/prewarmLiveSearchWorkers";
import { runBotMatch, type SeatConfig } from "#api/bot/matchHarness";
import { createEvaluationPolicy } from "#api/bot/policy";
import { createBotRandom } from "#api/bot/rng";
import { measureStyleEvents } from "#api/bot/style/measureStyleEvents";
import { mainActionReady } from "#api/bot/training/actions";
import { createTrainingPolicy } from "#api/bot/training/policy";
import { validateDecklist } from "#api/engine/deckValidation";
import type { Decklist } from "#api/engine/setup";

function parseDeck(input: unknown): Decklist {
  if (
    typeof input !== "object" ||
    input === null ||
    !("mainDeck" in input) ||
    !("eggDeck" in input) ||
    !Array.isArray(input.mainDeck) ||
    !Array.isArray(input.eggDeck) ||
    !input.mainDeck.every((card) => typeof card === "string") ||
    !input.eggDeck.every((card) => typeof card === "string")
  ) {
    throw new Error("Level panels require explicit decklists");
  }
  const deck = { mainDeck: [...input.mainDeck], eggDeck: [...input.eggDeck] };
  const check = validateDecklist(deck);
  if (!check.ok) {
    throw new Error(`Illegal level panel deck: ${check.reason}`);
  }
  return deck;
}

type Options = { searchTiming?: LevelSearchTiming };

export async function runLevelPanelGame(input: unknown, { searchTiming }: Options = {}) {
  if (typeof input !== "object" || input === null) {
    throw new Error("Invalid level panel input");
  }
  const value = input as Record<string, unknown>;
  const { difficulty, style, reference, seed, seat } = value;
  if (
    !isBotDifficulty(difficulty) ||
    !isBotStyle(style) ||
    !isBotReference(reference) ||
    typeof seed !== "number" ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed >= 2 ** 32 ||
    (seat !== 0 && seat !== 1) ||
    !Array.isArray(value.decks) ||
    value.decks.length !== 2
  ) {
    throw new Error("Invalid level panel configuration");
  }
  const referenceDifficulty = value.referenceDifficulty;
  const referenceStyle = value.referenceStyle;
  if (
    reference === BotReference.SELECTED_LEVEL.value &&
    (!isBotDifficulty(referenceDifficulty) || !isBotStyle(referenceStyle))
  ) {
    throw new Error("Selected-level reference needs a difficulty and style");
  }
  const turnLimit = value.turnLimit ?? 60;
  const firstSeat = value.firstSeat;
  if (
    typeof turnLimit !== "number" ||
    !Number.isSafeInteger(turnLimit) ||
    turnLimit < 1 ||
    turnLimit > 200 ||
    (firstSeat !== undefined && firstSeat !== 0 && firstSeat !== 1)
  ) {
    throw new Error("Invalid level panel bounds");
  }
  const decks = value.decks.map(parseDeck);
  const seats = [0, 1].map((currentSeat): SeatConfig => {
    const current = currentSeat as Seat;
    const deck = decks[currentSeat === seat ? 0 : 1]!;
    const assignedDifficulty =
      currentSeat === seat
        ? difficulty
        : reference === BotReference.SELECTED_LEVEL.value && isBotDifficulty(referenceDifficulty)
          ? referenceDifficulty
          : undefined;
    const policyTimeoutMs =
      assignedDifficulty !== undefined && BOT_LEVEL_CONFIGS[assignedDifficulty].searchSimulations > 0
        ? (searchTiming?.policyTimeoutMs ?? LEVEL_SEARCH_POLICY_TIMEOUT_MS)
        : undefined;
    return {
      deck,
      label: currentSeat === seat ? `${difficulty}:${style}` : reference,
      ...(policyTimeoutMs === undefined ? {} : { policyTimeoutMs }),
      canChooseMainAction: (engine) => mainActionReady(engine),
      policyFactory: (engine) => {
        const policySeed = seed + current * 7919;
        if (currentSeat === seat) {
          return createLevelBotOptions({
            engine,
            seat: current,
            deck,
            seed: policySeed,
            difficulty,
            style,
            searchTiming,
          }).policy!;
        }
        if (
          reference === BotReference.SELECTED_LEVEL.value &&
          isBotDifficulty(referenceDifficulty) &&
          isBotStyle(referenceStyle)
        ) {
          return createLevelBotOptions({
            engine,
            seat: current,
            deck,
            seed: policySeed,
            difficulty: referenceDifficulty,
            style: referenceStyle,
            searchTiming,
          }).policy!;
        }
        if (reference === BotReference.LEGACY_BALANCED.value) {
          return createEvaluationPolicy({ seed: policySeed });
        }
        if (reference === BotReference.CERTIFIED_RESIDUAL.value) {
          return defaultBotOptions({ engine, seat: current, deck, options: { seed: policySeed } }).policy!;
        }
        if (reference === BotReference.RANDOM_LEGAL.value) {
          const random = createBotRandom(policySeed);
          return createTrainingPolicy(engine, current, (window) => Math.floor(random.next() * window.actions.length));
        }
        const arm =
          reference === BotReference.TURN_PLANNER.value ? BotArm.HUMAN_PANEL_PLANNER.value : BotArm.HUMAN_PANEL.value;
        return createBotArmOptions({
          arm,
          engine,
          seat: current,
          deck,
          onFallback: () => {
            throw new Error("Reference policy fell back");
          },
        })!.policy!;
      },
    };
  }) as [SeatConfig, SeatConfig];
  if (seats.some((config) => config.policyTimeoutMs !== undefined)) await prewarmLiveSearchWorkers();
  const started = performance.now();
  const result = await runBotMatch({
    seed,
    seats,
    turnLimit,
    firstSeat,
    captureEvents: true,
    measureDecisionLatencies: true,
  });
  const valid = validEvolutionGame(result);
  return {
    valid,
    win: valid && result.winnerSeat !== undefined ? result.winnerSeat === seat : null,
    reason: result.reason,
    turn: result.turnCount,
    ms: Math.round(performance.now() - started),
    style: measureStyleEvents({ events: result.events! }),
    latencies: result.seats.map((stats) => stats.decisionLatenciesMs),
    searchFallbacks: result.seats.map((stats) => stats.searchFallbacks ?? null),
    searchErrors: result.seats.map((stats) => stats.searchErrors ?? null),
    ...(valid
      ? {}
      : {
          problem: {
            rejections: result.rejections,
            errors: result.errors,
            timedOut: result.timedOut,
            fallbacks: result.seats.map((stats) => stats.inferenceFallbacks),
          },
        }),
  };
}
