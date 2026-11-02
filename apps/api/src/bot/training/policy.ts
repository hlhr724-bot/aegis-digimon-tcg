import type { DecisionRequest, Intent, Seat } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import type { BotPolicy } from "../policy.js";
import { createObservationHistory } from "./history.js";
import { teacherActionIndex } from "./teacher.js";
import { breedingActions, mainActions, type TrainingAction } from "./actions.js";
import { decisionSteps } from "./decisions.js";
import { counterActions } from "./counter.js";
import { assemblyMaterialSteps } from "./assembly.js";
import { selectionCards, trainingObservation, type TrainingObservation } from "./observation.js";

export interface TrainingWindow {
  observation: TrainingObservation;
  kind: string;
  teacher?: { action: number | null };
  combat?: { targetsPlayer: boolean; mustBlock: boolean; targetPermanentId?: string };
  request?: DecisionRequest;
  selected: readonly string[];
  actions: readonly TrainingAction[];
}

export type ChooseTrainingAction = (window: TrainingWindow) => number;

export type TrainingPolicy<Result extends Intent | Promise<Intent>> = BotPolicy<Result> & {
  /** Deferred plays the engine rejected for memory after the policy chose them; each is excluded until memory changes. */
  recoveredPlayRejections(): number;
};

type TrainingSteps = Generator<TrainingWindow, Intent, number>;
export type ChooseAsyncTrainingAction = (window: TrainingWindow, signal: AbortSignal) => Promise<number>;

export function createTrainingPolicy(
  engine: GameEngine,
  seat: Seat,
  choose: ChooseTrainingAction,
  teacher?: BotPolicy,
): TrainingPolicy<Intent> {
  return buildTrainingPolicy(
    engine,
    seat,
    (steps) => {
      let step = steps.next();
      while (!step.done) step = steps.next(choose(step.value));
      return step.value;
    },
    teacher,
  );
}

export function createAsyncTrainingPolicy(
  engine: GameEngine,
  seat: Seat,
  choose: ChooseAsyncTrainingAction,
  teacher?: BotPolicy,
  mainActionSource?: () => TrainingAction[] | undefined,
): TrainingPolicy<Promise<Intent>> {
  return buildTrainingPolicy(
    engine,
    seat,
    async (steps, signal = new AbortController().signal) => {
      signal.throwIfAborted();
      let step = steps.next();
      while (!step.done) {
        signal.throwIfAborted();
        const index = await choose(step.value, signal);
        signal.throwIfAborted();
        step = steps.next(index);
      }
      return step.value;
    },
    teacher,
    mainActionSource,
  );
}

function buildTrainingPolicy<Result extends Intent | Promise<Intent>>(
  engine: GameEngine,
  seat: Seat,
  run: (steps: TrainingSteps, signal?: AbortSignal) => Result,
  teacher?: BotPolicy,
  mainActionSource?: () => TrainingAction[] | undefined,
): TrainingPolicy<Result> {
  const history = createObservationHistory();
  let activationObservation = "";
  const attemptedActivations = new Set<string>();
  // The engine may accept a play whose pay-time reduction later proves unavailable. After that
  // rejection the card stays in hand, so offering it again at the same memory would loop.
  let chosenPlay: { instanceId: string; turn: number; declaration: string } | undefined;
  const rejectedPlays = new Map<string, { turn: number; memory: number }>();
  let recovered = 0;
  const rejectedNow = (action: TrainingAction): boolean => {
    if (action.intent.type !== "playCard" || action.assembly !== undefined) return false;
    const rejection = rejectedPlays.get(JSON.stringify(action.intent));
    return rejection?.turn === engine.state.turnCount && rejection.memory === engine.state.memory;
  };
  const observe = (request?: DecisionRequest): TrainingObservation => {
    const observation = trainingObservation(engine.state, seat, request);
    history.observe(observation);
    return { ...observation, history: history.snapshot() };
  };
  const withTeacher = (window: TrainingWindow, intent?: Intent, originatingIntent?: Intent): TrainingWindow =>
    intent === undefined
      ? window
      : { ...window, teacher: { action: teacherActionIndex(window, intent, originatingIntent) ?? null } };
  function* actionSteps(
    kind: string,
    actions: TrainingAction[],
    combat?: TrainingWindow["combat"],
    demonstration?: Intent,
  ): TrainingSteps {
    const observation = observe();
    if (kind === "main") {
      const key = JSON.stringify({ ...observation, history: undefined });
      if (key !== activationObservation) {
        activationObservation = key;
        attemptedActivations.clear();
      }
      actions = actions.filter(
        (action) => action.intent.type !== "activateEffect" || !attemptedActivations.has(JSON.stringify(action.intent)),
      );
    }
    const index = yield withTeacher(
      {
        observation,
        kind,
        selected: [],
        actions,
        ...(combat === undefined ? {} : { combat }),
      },
      demonstration,
    );
    if (!Number.isInteger(index) || index < 0 || index >= actions.length)
      throw new Error(`Invalid training action index ${index}`);
    const action = actions[index]!;
    if (kind === "main" && action.intent.type === "activateEffect") {
      attemptedActivations.add(JSON.stringify(action.intent));
    }
    if (kind === "main")
      chosenPlay =
        action.intent.type === "playCard" && action.assembly === undefined
          ? {
              instanceId: action.intent.instanceId,
              turn: engine.state.turnCount,
              declaration: JSON.stringify(action.intent),
            }
          : undefined;
    if (action.assembly === undefined) return action.intent;
    const steps = assemblyMaterialSteps(action.assembly.cardId, action.assembly.candidates, false);
    let step = steps.next();
    while (!step.done) {
      step = steps.next(
        yield withTeacher(
          {
            observation: observe(),
            kind: "selectCards",
            selected: step.value.selected,
            actions: step.value.choices.map((choice) => ({
              // Material markers are private bridge values; only the completed play reaches the engine.
              intent: {
                type: "respondDecision",
                decisionId: "assembly",
                response: {
                  kind: "selectCards",
                  instanceIds: choice.referenceId === undefined ? [] : [choice.referenceId],
                },
              },
              label: choice.label,
              sourceId: choice.referenceId ?? action.sourceId,
            })),
          },
          demonstration,
          action.intent,
        ),
      );
    }
    return { type: "playCard", instanceId: action.sourceId!, assembly: { materialInstanceIds: step.value } };
  }
  const take = (
    kind: string,
    actions: TrainingAction[],
    combat?: TrainingWindow["combat"],
    demonstration?: Intent,
    signal?: AbortSignal,
  ): Result => run(actionSteps(kind, actions, combat, demonstration), signal);
  const binary = (
    type: "respondEvade" | "respondBarrier",
    permanentId: string,
    demonstration?: Intent,
    signal?: AbortSignal,
  ): Result =>
    take(
      type,
      [true, false].map((accept) => ({
        intent: { type, permanentId, accept },
        label: accept ? "Accept" : "Decline",
        sourceId: permanentId,
      })),
      undefined,
      demonstration,
      signal,
    );
  return {
    name: "training:external",
    observeEvent: (event) => {
      history.observeEvent(event);
      teacher?.observeEvent?.(event);
    },
    onTurnStart() {
      teacher?.onTurnStart();
    },
    chooseBreedingAction: (view, signal) =>
      take("breeding", breedingActions(engine, seat), undefined, teacher?.chooseBreedingAction(view), signal),
    chooseMainAction: (view, signal) =>
      take(
        "main",
        (mainActionSource?.() ?? mainActions(engine, seat)).filter((action) => !rejectedNow(action)),
        undefined,
        teacher?.chooseMainAction(view),
        signal,
      ),
    chooseBlockResponse: (view, context, signal) =>
      take(
        "block",
        [
          ...(context.mustBlock
            ? []
            : [
                {
                  intent: { type: "declineBlock" } as Intent,
                  label: "Decline block",
                  targetId: context.attackerPermanentId,
                },
              ]),
          ...context.eligibleBlockerIds.map((blockerPermanentId) => ({
            intent: { type: "declareBlock", blockerPermanentId } as Intent,
            label: "Block",
            sourceId: blockerPermanentId,
            targetId: context.attackerPermanentId,
          })),
        ],
        {
          targetsPlayer: context.targetsPlayer,
          mustBlock: context.mustBlock,
          ...(context.targetPermanentId === undefined ? {} : { targetPermanentId: context.targetPermanentId }),
        },
        teacher?.chooseBlockResponse(view, context),
        signal,
      ),
    chooseCounterResponse: (view, context, signal) =>
      take(
        "counter",
        counterActions(engine, seat, context),
        undefined,
        teacher?.chooseCounterResponse(view, context),
        signal,
      ),
    chooseAllianceResponse: (view, context, signal) =>
      take(
        "alliance",
        [
          { intent: { type: "respondAlliance" }, label: "Decline alliance", targetId: context.permanentId },
          ...context.eligibleAllyIds.map((allyPermanentId) => ({
            intent: { type: "respondAlliance", allyPermanentId } as Intent,
            label: "Alliance",
            sourceId: allyPermanentId,
            targetId: context.permanentId,
          })),
        ],
        undefined,
        teacher?.chooseAllianceResponse(view, context),
        signal,
      ),
    chooseEvadeResponse: (view, permanentId, signal) =>
      binary("respondEvade", permanentId, teacher?.chooseEvadeResponse(view, permanentId), signal),
    chooseBarrierResponse: (view, permanentId, signal) =>
      binary("respondBarrier", permanentId, teacher?.chooseBarrierResponse(view, permanentId), signal),
    answerDecision: (view, request, signal) => {
      const demonstration = teacher?.answerDecision(view, request);
      const observation = observe(request);
      function* selections(): TrainingSteps {
        const steps = decisionSteps(request, selectionCards(observation));
        let step = steps.next();
        while (!step.done) {
          const index = yield withTeacher(
            {
              observation,
              kind: request.kind,
              request,
              selected: step.value.selected,
              actions: step.value.choices.map((choice) => ({
                // Subselection intents are private bridge markers and never reach the engine.
                intent: choice.intent ?? {
                  type: "respondDecision",
                  decisionId: request.decisionId,
                  response: {
                    kind: "selectCards",
                    instanceIds: choice.referenceId === undefined ? [] : [choice.referenceId],
                  },
                },
                label: choice.label,
                ...(choice.referenceId === undefined ? {} : { sourceId: choice.referenceId }),
              })),
            },
            demonstration,
          );
          step = steps.next(index);
        }
        return step.value;
      }
      return run(selections(), signal);
    },
    noteRejected(intent) {
      throw new Error(`Training action rejected: ${JSON.stringify(intent)}`);
    },
    onEngineRejection(event) {
      const play = chosenPlay;
      if (
        play === undefined ||
        event.intent !== "playCard" ||
        event.reason !== "insufficient-memory" ||
        engine.state.gameOver ||
        engine.state.turnSeat !== seat ||
        engine.state.turnCount !== play.turn ||
        !engine.state.players[seat]?.hand.some((card) => card.instanceId === play.instanceId)
      )
        return;
      chosenPlay = undefined;
      rejectedPlays.set(play.declaration, { turn: play.turn, memory: engine.state.memory });
      recovered++;
    },
    recoveredPlayRejections: () => recovered,
  };
}
