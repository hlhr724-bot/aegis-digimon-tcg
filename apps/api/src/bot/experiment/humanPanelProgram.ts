import catalog from "#api/bot/evolution/programs/human-panel-v2.json" with { type: "json" };
import {
  defaultTurnPlannerParameters,
  type TurnPlannerParameters,
  type TurnPlannerWeights,
} from "#api/bot/evolution/defaultTurnPlannerParameters";
import { parseHeuristic, type HeuristicProgram } from "#api/bot/evolution/heuristic";

const WEIGHT_NAMES = Object.keys(defaultTurnPlannerParameters.weights) as (keyof TurnPlannerWeights)[];

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parsePlannerWeights(value: unknown): TurnPlannerWeights {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Human panel planner weights must be an object");
  }
  const entries = Object.entries(value);
  if (entries.length !== WEIGHT_NAMES.length || entries.some(([name]) => !WEIGHT_NAMES.includes(name as never))) {
    throw new Error(`Human panel planner weights must be exactly: ${WEIGHT_NAMES.join(", ")}`);
  }
  if (entries.some(([, weight]) => typeof weight !== "number" || !Number.isFinite(weight))) {
    throw new Error("Human panel planner weights must be finite numbers");
  }
  return Object.freeze(Object.fromEntries(entries)) as unknown as TurnPlannerWeights;
}

function parsePlannerParameters(value: unknown): TurnPlannerParameters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Human panel planner parameters must be an object");
  }
  const { depth, beam, weights } = value as Record<string, unknown>;
  if (!isPositiveInteger(depth) || !isPositiveInteger(beam)) {
    throw new Error("Human panel planner depth and beam must be positive integers");
  }
  return Object.freeze({ depth, beam, weights: parsePlannerWeights(weights) });
}

function parseHumanPanelCatalog(value: typeof catalog): { program: HeuristicProgram; planner: TurnPlannerParameters } {
  if (value.schemaVersion !== 1) {
    throw new Error("Unsupported human panel program version");
  }
  const program = parseHeuristic(value.program);
  if (program.basePolicy !== undefined) {
    throw new Error("The human panel program must score actions without a base policy");
  }
  return { program, planner: parsePlannerParameters(value.planner) };
}

export const humanPanelProgram = parseHumanPanelCatalog(catalog);
