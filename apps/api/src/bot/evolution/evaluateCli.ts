import { readFileSync } from "node:fs";
import { getCardDefinition, type Seat } from "@aegis/shared";
import { FEATURES, parseHeuristic, SEED_HEURISTIC } from "./heuristic.js";
import { randomDeck } from "./randomDecks.js";
import { evolutionPilotDecks } from "#api/bot/evolution/evolutionPilotDecks";
import { generatePilotPrograms } from "#api/bot/evolution/generatePilotPrograms";
import { generateComboPilotPrograms } from "#api/bot/evolution/generateComboPilotPrograms";
import certifiedCatalog from "#api/bot/evolution/programs/certified-balanced.json" with { type: "json" };
import type { SearchReport } from "#api/bot/evolution/mcts";

// Each evaluation creates an isolated game; application diagnostics stay off JSON stdout.
process.env.NODE_ENV = "test";
console.log = (...values: unknown[]) => console.error(...values);
const { runEvolutionMatch } = await import("./evolutionMatch.js");
const { runResidualMatch } = await import("./residualMatch.js");
const { runMctsResidualMatch } = await import("#api/bot/evolution/runMctsResidualMatch");
const { SEED_RESIDUAL } = await import("./residualPolicy.js");
const { evolutionDeck, EVOLUTION_DECK_VERSIONS } = await import("./decks.js");
const { trainingMetadata } = await import("../training/metadata.js");

type EvaluationInput = {
  seed: number;
  learnerSeat: Seat;
  decks: [string | number, string | number];
  program: unknown;
  opponentProgram?: unknown;
  opponent?: "heuristic" | "mcts" | "balanced";
  simulations?: number;
  learnerMctsSimulations?: number;
  mctsMaxSearches?: number;
  mctsExploration?: number;
  mctsMaxSearchTimeMs?: number;
  mctsRolloutTurns?: number;
  mctsMoveOrderingProgram?: unknown;
  mctsStartAfterDecisions?: number;
  searchSeed?: number;
  turnLimit?: number;
  captureTraces?: boolean;
  teacher?: { simulations: number; maxSearches: number; every: number; rolloutTurns?: number };
  engineSha256?: string;
};

async function evaluate(input: EvaluationInput, engineSha256: string) {
  try {
    if (
      !Number.isSafeInteger(input.seed) ||
      (input.learnerSeat !== 0 && input.learnerSeat !== 1) ||
      !Array.isArray(input.decks) ||
      input.decks.length !== 2 ||
      !input.decks.every((deck) => typeof deck === "string" || Number.isSafeInteger(deck)) ||
      (input.mctsRolloutTurns !== undefined &&
        (!Number.isSafeInteger(input.mctsRolloutTurns) ||
          input.mctsRolloutTurns < 1 ||
          input.mctsRolloutTurns > 200)) ||
      (input.mctsExploration !== undefined && (!Number.isFinite(input.mctsExploration) || input.mctsExploration < 0)) ||
      (input.mctsMaxSearchTimeMs !== undefined &&
        (!Number.isFinite(input.mctsMaxSearchTimeMs) || input.mctsMaxSearchTimeMs <= 0)) ||
      (input.turnLimit !== undefined &&
        (!Number.isSafeInteger(input.turnLimit) || input.turnLimit < 1 || input.turnLimit > 200)) ||
      (input.opponent !== undefined && !["mcts", "heuristic", "balanced"].includes(input.opponent)) ||
      (input.simulations !== undefined &&
        (!Number.isSafeInteger(input.simulations) || input.simulations < 1 || input.simulations > 10000)) ||
      (input.learnerMctsSimulations !== undefined &&
        (!Number.isSafeInteger(input.learnerMctsSimulations) ||
          input.learnerMctsSimulations < 0 ||
          input.learnerMctsSimulations > 10000)) ||
      [input.mctsMaxSearches, input.mctsStartAfterDecisions].some(
        (limit) => limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0),
      ) ||
      (input.searchSeed !== undefined && !Number.isSafeInteger(input.searchSeed)) ||
      (input.teacher !== undefined &&
        [
          input.teacher.simulations,
          input.teacher.maxSearches,
          input.teacher.every,
          input.teacher.rolloutTurns ?? 1,
        ].some((bound) => !Number.isSafeInteger(bound) || bound < 1 || bound > 10000))
    )
      throw new Error("Invalid evaluation configuration");
    if (input.engineSha256 !== undefined && input.engineSha256 !== engineSha256)
      throw new Error("Worker engine changed since experiment was pinned");
    const program = parseHeuristic(input.program);
    const opponentProgram = input.opponentProgram === undefined ? undefined : parseHeuristic(input.opponentProgram);
    const moveOrderingProgram =
      input.mctsMoveOrderingProgram === undefined ? undefined : parseHeuristic(input.mctsMoveOrderingProgram);
    const decks = input.decks.map((source) =>
      typeof source === "number" ? randomDeck(source) : evolutionDeck(source),
    );
    if (input.learnerMctsSimulations !== undefined && !program.basePolicy)
      throw new Error("Learner search requires a residual policy");
    if (input.learnerMctsSimulations !== undefined && input.opponent === "mcts")
      throw new Error("Only one search seat may be enabled per comparison");
    if (input.opponent === "balanced" && program.basePolicy !== "projected-balanced")
      throw new Error("Balanced comparison requires a residual program");
    if (input.opponent === "balanced" && opponentProgram !== undefined)
      throw new Error("Balanced comparison cannot override the control policy");
    const residualSearch = Boolean(
      program.basePolicy && (input.opponent === "mcts" || input.learnerMctsSimulations !== undefined),
    );
    if (
      !residualSearch &&
      (input.mctsExploration !== undefined ||
        input.mctsMaxSearchTimeMs !== undefined ||
        moveOrderingProgram !== undefined)
    ) {
      throw new Error("Search tuning requires residual MCTS");
    }
    if (input.mctsRolloutTurns !== undefined && !residualSearch && input.opponent !== "mcts")
      throw new Error("Rollout bounds require an MCTS search seat");
    if (input.teacher !== undefined && (program.basePolicy || input.captureTraces !== true))
      throw new Error("Teacher searches advise traced heuristic games only");
    const runner = residualSearch ? runMctsResidualMatch : program.basePolicy ? runResidualMatch : runEvolutionMatch;
    const evaluation = await runner({
      seed: input.seed,
      decks: [decks[0]!.deck, decks[1]!.deck],
      learnerSeat: input.learnerSeat,
      program,
      simulations: input.learnerMctsSimulations ?? input.simulations ?? 256,
      searchSeed: input.searchSeed ?? 0x5ea2c4,
      ...(program.basePolicy
        ? {
            opponent: input.opponent === "heuristic" ? ("heuristic" as const) : ("balanced" as const),
          }
        : {}),
      opponentProgram,
      ...(residualSearch
        ? {
            searchSeat:
              input.learnerMctsSimulations !== undefined
                ? input.learnerSeat
                : input.learnerSeat === 0
                  ? (1 as const)
                  : (0 as const),
            maxSearches: input.mctsMaxSearches,
            exploration: input.mctsExploration,
            maxSearchTimeMs: input.mctsMaxSearchTimeMs,
            rolloutTurns: input.mctsRolloutTurns,
            moveOrderingProgram,
            startAfterDecisions: input.mctsStartAfterDecisions,
          }
        : {}),
      ...(input.opponent === "mcts"
        ? {
            mcts: {
              simulations: input.simulations ?? 256,
              omitRolloutHandAffordances: true,
              seed: input.searchSeed ?? 0x5ea2c4,
              maxSearches: input.mctsMaxSearches,
              startAfterDecisions: input.mctsStartAfterDecisions,
              rolloutTurns: input.mctsRolloutTurns,
            },
          }
        : {}),
      turnLimit: input.turnLimit,
      captureTraces: input.captureTraces,
      ...(input.teacher === undefined
        ? {}
        : { teacher: { ...input.teacher, seed: ((input.searchSeed ?? 0x5ea2c4) ^ 0x7eac4e) >>> 0 } }),
      onSearch: (report: SearchReport) =>
        process.stderr.write(
          `${JSON.stringify({
            type: "mcts-search",
            requested: report.requested,
            attempted: report.attempted,
            completed: report.completed,
            invalid: report.invalid,
            nodes: report.nodes,
            ...(report.leafEvaluations === undefined ? {} : { leafEvaluations: report.leafEvaluations }),
            ...(report.timeBudget === undefined ? {} : { timeBudget: report.timeBudget }),
          })}\n`,
        ),
    });
    const { result, valid, decisions, traces, searches } = evaluation;
    const asynchronousRejections = result.events!.filter((event) => event.kind === "actionRejected");
    const score = valid
      ? result.winnerSeat === undefined
        ? 0.5
        : Number(result.winnerSeat === input.learnerSeat)
      : null;
    return {
      schemaVersion: 1,
      seed: input.seed,
      learnerSeat: input.learnerSeat,
      decks: decks.map(({ id }) => id),
      opponent:
        input.opponent === "mcts"
          ? "information-set-mcts"
          : program.basePolicy && opponentProgram === undefined
            ? "projected-balanced"
            : "coevolved-heuristic",
      score,
      status: valid ? "played" : result.timedOut ? "timed-out" : "invalid",
      valid,
      result: { ...result, events: undefined },
      asynchronousRejections,
      decisions,
      traces,
      searches,
      ...("teacher" in evaluation && evaluation.teacher !== undefined ? { teacher: evaluation.teacher } : {}),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      valid: false,
      score: null,
    };
  }
}

if (process.argv.includes("--describe-combo-pilots")) {
  const generic = parseHeuristic(certifiedCatalog.generic);
  const decks = evolutionPilotDecks();
  const versions = [
    "ex4-dgo-2022-06-25-1-ulforceveedramon@1",
    "ex6-dgo-2024-07-06-1-miragegaogamon@2",
    "bt25-dgo-2026-06-06-4-shinegreymon@1",
  ];
  process.stdout.write(
    `${JSON.stringify({
      ...trainingMetadata(),
      generic,
      features: FEATURES,
      proposalOrigin: "deterministic-bounded-combo",
      proposalGrid: [4, 8, 12],
      availableDeckVersions: decks.available.map((deck) => deck.id),
      excludedDecks: decks.excluded,
      blockedIntents: [
        "Cannot inspect remaining inherited/effect per-turn uses",
        "Cannot condition on source-stack inherited card IDs",
        "Cannot rank optional/effect choices with projected-balanced residual",
        "Cannot bind trigger-order preference such as Thomas-before-Burst",
        "Cannot predict reduced-cost evolution under every live restriction",
      ],
      pilotDecks: versions.map((version) => {
        const deck = evolutionDeck(version);
        return {
          ...deck,
          proposals: generateComboPilotPrograms({
            version,
            deck: deck.deck,
            name: deck.name,
            generic,
          }),
        };
      }),
    })}\n`,
  );
  process.exitCode = 0;
} else if (process.argv.includes("--describe-pilots")) {
  const decks = evolutionPilotDecks();
  const generic = parseHeuristic(certifiedCatalog.generic);
  process.stdout.write(
    `${JSON.stringify({
      ...trainingMetadata(),
      generic,
      features: FEATURES,
      proposalOrigin: "deterministic-structural",
      pilotDecks: decks.available.map((deck) => ({
        ...deck,
        proposals: generatePilotPrograms({ deck: deck.deck, name: deck.name, generic }),
      })),
      excludedDecks: decks.excluded,
    })}\n`,
  );
  process.exitCode = 0;
} else if (process.argv.includes("--describe")) {
  process.stdout.write(
    `${JSON.stringify({
      ...trainingMetadata(),
      features: FEATURES,
      seedProgram: SEED_HEURISTIC,
      residualSeedProgram: SEED_RESIDUAL,
      deckVersions: EVOLUTION_DECK_VERSIONS,
      evolutionDecks: EVOLUTION_DECK_VERSIONS.map(evolutionDeck),
      cards: [
        ...new Set(
          EVOLUTION_DECK_VERSIONS.flatMap((version) => {
            const { deck } = evolutionDeck(version);
            return [...deck.mainDeck, ...deck.eggDeck];
          }),
        ),
      ].map((id) => {
        const card = getCardDefinition(id)!;
        return {
          cardId: id,
          name: card.nameEn,
          level: card.level,
          dp: card.dp,
          playCost: card.playCost,
          effectText: card.effectText,
          inheritedEffectText: card.inheritedEffectText,
        };
      }),
      mcts: {
        defaultSimulations: 256,
        reconstruction: "exact-engine-replay",
        belief: "uniform-open-decklist",
        genericRolloutHandAffordances: false,
      },
    })}\n`,
  );
  process.exitCode = 0;
} else {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const batch = process.argv.includes("--batch");
    if (
      batch &&
      (!Array.isArray(input) ||
        input.length < 1 ||
        input.length > 32 ||
        input.some(
          (item) =>
            (item.opponent !== "balanced" && item.opponent !== "heuristic") ||
            item.learnerMctsSimulations !== undefined,
        ))
    )
      throw new Error("Batch evaluations require 1–32 games without search");
    const engineSha256 = trainingMetadata().engineSha256;
    const outputs = [];
    for (const task of batch ? input : [input]) outputs.push(await evaluate(task, engineSha256));
    if (trainingMetadata().engineSha256 !== engineSha256) throw new Error("Worker engine changed during evaluation");
    process.stdout.write(`${JSON.stringify(batch ? outputs : outputs[0])}\n`);
    process.exitCode = outputs.every((output) => output.valid) ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  }
}
