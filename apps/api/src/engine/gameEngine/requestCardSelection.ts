import type { Seat } from "@aegis/shared";
import type { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import type { GameEngine } from "#api/engine/GameEngine";

type CardSelectionParams = {
  seat: Seat;
  candidateInstanceIds: string[];
  min: number;
  max: number;
  promptText: string;
  source: { sourceCardId: string; sourceInstanceId: string; sourcePermanentId: string };
  selectionGoal?: DecisionSelectionGoal;
};

export async function requestCardSelection(
  engine: GameEngine,
  { seat, candidateInstanceIds, min, max, promptText, source, selectionGoal }: CardSelectionParams,
): Promise<string[]> {
  const response = await engine.decisions.request({
    seat,
    kind: "selectCards",
    promptText,
    ...source,
    options: { candidateInstanceIds, min, max, ...(selectionGoal === undefined ? {} : { selectionGoal }) },
  });
  return response.kind === "selectCards" ? response.instanceIds : [];
}
