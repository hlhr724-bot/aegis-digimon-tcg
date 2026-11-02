import type { Intent } from "@aegis/shared/protocol/intents";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import type { MatchReplayCursor } from "#api/bot/createMatchReplayRecorder";
import type { ExposureDecision } from "#api/bot/evolution/createHeuristicExposureChooser";
import { getReplaySearchWindow } from "#api/bot/evolution/getReplaySearchWindow";
import { actionKey, informationKey } from "#api/bot/evolution/mcts";
import type { TrainingWindow } from "#api/bot/training/policy";
import type { ReplayInput, ReplayRecord } from "#api/replays/inputs/types";

export type ChangedPosition = {
  inputIndex: number;
  seat: Seat;
  information: string;
  turn: number;
  candidateAction: number;
  baselineAction: number;
};

type PendingPosition = ChangedPosition & { intent: Intent };

type Params = { engine: GameEngine; seat: Seat; replay: MatchReplayCursor };

function findRootAction(root: TrainingWindow, window: TrainingWindow, index: number): number {
  const key = actionKey(window, index);
  return root.actions.findIndex((_, action) => actionKey(root, action) === key);
}

function isRecordedPlay(recorded: Intent, chosen: Intent): boolean {
  return recorded.type === "playCard" && chosen.type === "playCard" && recorded.instanceId === chosen.instanceId;
}

function isProducedBy(input: ReplayInput | undefined, position: PendingPosition): boolean {
  if (input?.kind !== "intent" || input.seat !== position.seat || input.ok !== true) {
    return false;
  }
  return (
    JSON.stringify(input.intent) === JSON.stringify(position.intent) || isRecordedPlay(input.intent, position.intent)
  );
}

export function createChangedPositionTracker({ engine, seat, replay }: Params) {
  const pending: PendingPosition[] = [];
  const skipped = { unmapped: 0, unrecorded: 0 };

  function getRoot(): TrainingWindow | undefined {
    try {
      return getReplaySearchWindow({ engine, seat });
    } catch {
      return undefined;
    }
  }

  function observe({ window, candidate, baseline }: ExposureDecision) {
    if (window.kind !== "main" || candidate === baseline) {
      return;
    }
    const root = getRoot();
    const candidateAction = root === undefined ? -1 : findRootAction(root, window, candidate);
    const baselineAction = root === undefined ? -1 : findRootAction(root, window, baseline);
    if (root === undefined || candidateAction < 0 || baselineAction < 0) {
      skipped.unmapped += 1;
      return;
    }
    pending.push({
      inputIndex: replay.nextInputIndex(),
      seat,
      information: informationKey(root),
      turn: window.observation.turn,
      candidateAction,
      baselineAction,
      intent: structuredClone(window.actions[candidate]!.intent),
    });
  }

  function getPositions(record: ReplayRecord): ChangedPosition[] {
    const recorded = pending.filter((position) => isProducedBy(record.inputs[position.inputIndex], position));
    skipped.unrecorded = pending.length - recorded.length;
    return recorded.map(({ intent: _intent, ...position }) => position);
  }

  return { observe, getPositions, skipped };
}
