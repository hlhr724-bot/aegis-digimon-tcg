import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
process.env.NODE_ENV = "test";
process.env.AEGIS_STRICT_EFFECTS = "0";
const write = process.stdout.write.bind(process.stdout);
console.log = console.info = console.debug = console.warn = () => {};
const { getPanelScoringWindow } = await import("./getPanelScoringWindow.mjs");

const apiDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../apps/api/dist");
const moduleAt = (name) => import(pathToFileURL(resolve(apiDist, name)).href);
const { auditReplayTeacherAlignment } = await moduleAt("bot/evolution/auditReplayTeacherAlignment.js");
const { createHeuristicExposureChooser } = await moduleAt("bot/evolution/createHeuristicExposureChooser.js");
const { createChangedPositionTracker } = await moduleAt("bot/evolution/createChangedPositionTracker.js");
const { runReplayContinuation } = await moduleAt("bot/evolution/runReplayContinuation.js");
const { runReplayTeacher } = await moduleAt("bot/evolution/runReplayTeacher.js");
const { inspectReplayTeacherInput } = await moduleAt("bot/evolution/inspectReplayTeacherInput.js");
const { extractReplay } = await moduleAt("replays/inputs/extract.js");
const { runBotMatch } = await moduleAt("bot/matchHarness.js");
const { runLevelPanelGame } = await moduleAt("bot/levels/runLevelPanelGame.js");
const { measureStyleEvents } = await moduleAt("bot/style/measureStyleEvents.js");
const { measureStyle } = await moduleAt("bot/style/measureStyle.js");
const { mainActionReady } = await moduleAt("bot/training/actions.js");
const { createTrainingPolicy } = await moduleAt("bot/training/policy.js");
const { actionCardId, actionFeatures, chooseHeuristic, parseHeuristic, rankHeuristic } =
  await moduleAt("bot/evolution/heuristic.js");
const { validEvolutionGame } = await moduleAt("bot/evolution/evolutionMatch.js");
const { defaultBotOptions } = await moduleAt("bot/defaultBotOptions.js");
const { createTurnPlannerChooser } = await moduleAt("bot/evolution/createTurnPlannerChooser.js");
const { createEvaluationPolicy } = await moduleAt("bot/policy.js");
const { resolveBotProfile } = await moduleAt("bot/profiles.js");
const sharedEntry = createRequire(resolve(apiDist, "index.js")).resolve("@aegis/shared");
const { getCardDefinition } = await import(pathToFileURL(sharedEntry).href);

const MAX_TRACES = 300;
const MAX_PARSED = 64;
const parsed = new Map();

function parsedProgram(value) {
  const key = JSON.stringify(value);
  if (!parsed.has(key)) {
    if (parsed.size >= MAX_PARSED) parsed.clear();
    parsed.set(key, parseHeuristic(value));
  }
  return parsed.get(key);
}

const STATE_FEATURES = new Set([
  "bias",
  "ownHandCount",
  "opponentHandCount",
  "turn",
  "ownTrashCount",
  "opponentTrashCount",
  "ownSecurity",
  "opponentSecurity",
  "opponentBodies",
]);

function actionSpecific(features) {
  return Object.fromEntries(
    Object.entries(features)
      .filter(([key, value]) => value !== 0 && !STATE_FEATURES.has(key))
      .map(([key, value]) => [key, Math.round(value * 1000) / 1000]),
  );
}

function cardName(cardId) {
  return cardId === undefined ? undefined : getCardDefinition(cardId)?.nameEn;
}

function cardGlossary(traces) {
  const ids = new Set(
    traces.flatMap((trace) => [trace.chosen, ...trace.alternatives].map((action) => action.card).filter(Boolean)),
  );
  return Object.fromEntries(
    [...ids].map((id) => {
      const definition = getCardDefinition(id);
      return [
        id,
        {
          name: definition?.nameEn,
          level: definition?.level,
          playCost: definition?.playCost,
          dp: definition?.dp,
          effect: (definition?.effectText ?? "").slice(0, 400),
          inherited: (definition?.inheritedEffectText ?? "").slice(0, 200),
        },
      ];
    }),
  );
}

function describeAction(window, entry) {
  const cardId = actionCardId(window, entry.index);
  return {
    label: window.actions[entry.index].label,
    ...(cardId === undefined ? {} : { card: cardId, name: cardName(cardId) }),
    score: Math.round(entry.score * 1000) / 1000,
    secondaryScore: Math.round((entry.secondaryScore ?? 0) * 1000) / 1000,
    features: actionSpecific(actionFeatures(window, entry.index)),
  };
}

function describeUnit(unit) {
  return { card: unit.top.cardId, name: cardName(unit.top.cardId), dp: unit.dp, suspended: unit.suspended };
}

function describeWindow(program, window, chosen) {
  const own = window.observation.players.find((player) => player.seat === window.observation.seat);
  const enemy = window.observation.players.find((player) => player.seat !== window.observation.seat);
  const ranked = rankHeuristic(program, window);
  const choice = ranked.find((entry) => entry.index === chosen);
  return {
    turn: window.observation.turn,
    kind: window.kind,
    memory: window.observation.memory,
    ownSecurity: own.securityCount,
    opponentSecurity: enemy.securityCount,
    hand: own.hand.map((card) => card.cardId),
    ownBoard: own.board.map(describeUnit),
    opponentBoard: enemy.board.map(describeUnit),
    legalActions: window.actions.length,
    ...(window.request === undefined
      ? {}
      : {
          decision: {
            sourceCardId: window.request.sourceCardId,
            effectKey: window.request.options?.effectKey,
            purpose: window.request.options?.purpose,
            selectionGoal: window.request.options?.selectionGoal,
            targetFate: window.request.options?.targetFate,
            selectedCount: window.selected.length,
            minimum: window.request.options?.min,
            maximum: window.request.options?.max,
            declinesCost: window.request.options?.declinesCost,
            effectControllerSeat: window.request.options?.effectControllerSeat,
            effectSummary: window.request.options?.effectSummary,
            singleHandCostBenefit: window.request.options?.singleHandCostBenefit,
          },
        }),
    chosen: describeAction(window, choice),
    alternatives: ranked
      .filter((entry) => entry.index !== chosen)
      .slice(0, 3)
      .map((entry) => describeAction(window, entry)),
  };
}

function candidateChooser(program, seed, planner, traces, activationMemoryCosts, decisionContext, exposure) {
  const choose = planner
    ? createTurnPlannerChooser({ program, seed, parameters: planner === true ? undefined : planner })
    : (exposure?.choose ?? ((window) => chooseHeuristic(program, window, seed)));
  if (traces === undefined && activationMemoryCosts && decisionContext) return choose;
  return (window) => {
    const scoring = getPanelScoringWindow({ window, activationMemoryCosts, decisionContext });
    const index = choose(scoring);
    if (traces !== undefined && window.actions.length > 1 && traces.length < MAX_TRACES) {
      traces.push(describeWindow(program, scoring, index));
    }
    return index;
  };
}

function candidateSeat(program, seed, planner, traces, activationMemoryCosts, decisionContext, exposure) {
  return {
    policyFactory: (engine, seat) =>
      createTrainingPolicy(
        engine,
        seat,
        candidateChooser(
          program,
          seed + seat * 7919,
          planner,
          traces,
          activationMemoryCosts,
          decisionContext,
          exposure,
        ),
      ),
    canChooseMainAction: mainActionReady,
    maxMainPhaseActions: Number.POSITIVE_INFINITY,
  };
}

function opponentSeat(job, deck) {
  if (job.opponent === "legacy") return {};
  if (job.opponent === "certified")
    return {
      policyFactory: (engine, seat) =>
        defaultBotOptions({ engine, seat, deck, options: { seed: job.seed + seat * 7919 } }).policy,
      canChooseMainAction: mainActionReady,
    };
  if (job.opponentProgram !== undefined) {
    const program = parseHeuristic(job.opponentProgram);
    return {
      policyFactory: (engine, seat) =>
        createTrainingPolicy(
          engine,
          seat,
          candidateChooser(
            program,
            job.seed + seat * 7919,
            undefined,
            undefined,
            job.opponentActivationMemoryCosts !== false,
            job.opponentDecisionContext !== false,
          ),
        ),
      canChooseMainAction: mainActionReady,
      maxMainPhaseActions: Number.POSITIVE_INFINITY,
    };
  }
  throw new Error(`Unknown opponent ${job.opponent}`);
}

function continuationOpponent(game, seed) {
  const job = { ...game, seed };
  const config = opponentSeat(job, game.deck);
  return {
    policyFactory:
      config.policyFactory ??
      ((engine, seat) => createEvaluationPolicy({ profile: resolveBotProfile(undefined), seed: seed + seat * 7919 })),
    canChooseMainAction: config.canChooseMainAction,
    maxMainPhaseActions: config.maxMainPhaseActions,
  };
}

async function continuePanelGame(request) {
  const continuation = request.replayContinuation;
  const game = continuation.panelGame;
  const program = parsedProgram(request.program);
  return runReplayContinuation({
    ...continuation,
    program,
    choose: () => continuation.action,
    chooseAfterRoot: candidateChooser(
      program,
      continuation.sampleSeed + continuation.seat * 7919,
      undefined,
      undefined,
      game.activationMemoryCosts !== false,
      game.decisionContext !== false,
    ),
    opponent: continuationOpponent(game, continuation.sampleSeed),
    maxMainPhaseActions: Number.POSITIVE_INFINITY,
  });
}

function problemOf(result) {
  const rejection = result.rejections[0];
  return JSON.stringify({
    error: result.errors[0],
    rejection: rejection && {
      intent: rejection.intent,
      reason: rejection.reason,
      cardId: rejection.cardId,
      by: rejection.seat,
    },
    timedOut: result.timedOut,
    fallbacks: result.seats.map((seat) => seat.inferenceFallbacks),
  }).slice(0, 400);
}

async function play(job) {
  const program = parsedProgram(job.program);
  const decks = [];
  decks[job.seat] = job.decks[0];
  decks[1 - job.seat] = job.decks[1];
  const traces = job.trace === true ? [] : undefined;
  const recordReplay = job.recordReplay === true;
  let changes;
  const exposure =
    job.diagnosticBaseline === undefined
      ? undefined
      : createHeuristicExposureChooser({
          program,
          baseline: parsedProgram(job.diagnosticBaseline),
          seed: job.seed + job.seat * 7919,
          onDecision: (decision) => changes?.observe(decision),
        });
  const seats = [0, 1].map((seat) => ({
    deck: decks[seat],
    ...(seat === job.seat
      ? candidateSeat(
          program,
          job.seed,
          job.planner ?? undefined,
          traces,
          job.activationMemoryCosts !== false,
          job.decisionContext !== false,
          exposure,
        )
      : opponentSeat(job, decks[seat])),
  }));
  if (recordReplay && exposure !== undefined) {
    const candidate = seats[job.seat];
    seats[job.seat] = {
      ...candidate,
      policyFactory: (engine, seat, replay) => {
        changes = createChangedPositionTracker({ engine, seat, replay });
        return candidate.policyFactory(engine, seat);
      },
    };
  }
  const started = performance.now();
  const result = await runBotMatch({
    seed: job.seed,
    ...(job.firstSeat === undefined ? {} : { firstSeat: job.firstSeat }),
    seats,
    turnLimit: 60,
    captureEvents: true,
    measureDecisionLatencies: false,
    ...(recordReplay ? { recordReplay } : {}),
  });
  const valid = validEvolutionGame(result);
  const changedPositions = changes?.getPositions(result.replay);
  return {
    id: job.id,
    ...(exposure === undefined ? {} : { exposure: exposure.report }),
    valid,
    ...(valid ? {} : { problem: problemOf(result) }),
    win: result.winnerSeat === undefined ? null : result.winnerSeat === job.seat,
    turn: result.turnCount,
    style: measureStyleEvents({ events: result.events }),
    reason: result.reason,
    ms: Math.round(performance.now() - started),
    ...(traces === undefined ? {} : { traces, cards: cardGlossary(traces) }),
    ...(recordReplay ? { replay: result.replay } : {}),
    ...(changedPositions === undefined ? {} : { changedPositions, changedPositionSkips: changes.skipped }),
  };
}

function validate(request) {
  const rules = Array.isArray(request.validate?.rules) ? request.validate.rules : [];
  const cardIds = [
    ...new Set(
      rules.flatMap((rule) => [
        ...(rule.when?.sourceCardIds ?? []),
        ...(rule.when?.ownBoard?.cardIds ?? []),
        ...(rule.when?.ownHand?.cardIds ?? []),
      ]),
    ),
  ];
  const unknown = cardIds.filter((id) => typeof id !== "string" || getCardDefinition(id) === undefined);
  if (unknown.length > 0) return { id: request.id, error: `Unknown card IDs: ${unknown.join(", ")}` };
  parseHeuristic(request.validate);
  return { id: request.id, error: null };
}

async function handle(request) {
  try {
    if (request.levelPanel !== undefined) {
      return { id: request.id, ...(await runLevelPanelGame(request.levelPanel)) };
    }
    if (request.measureStyle !== undefined) {
      return { id: request.id, valid: true, style: await measureStyle({ replay: request.measureStyle }) };
    }
    if (request.teacherAlignment !== undefined) {
      return {
        id: request.id,
        ...auditReplayTeacherAlignment({
          ...request.teacherAlignment,
          program: parsedProgram(request.program),
          baseline: parsedProgram(request.teacherAlignment.baseline),
        }),
      };
    }
    if (request.validate !== undefined) return validate(request);
    if (request.inspectReplay !== undefined) {
      const { lines, matchId, expected } = request.inspectReplay;
      const record = extractReplay(lines, matchId);
      const inspection = await inspectReplayTeacherInput({
        record,
        expected,
        program: parsedProgram(request.program),
        capturePositions: request.capturePositions === true,
      });
      return { id: request.id, valid: true, record, ...inspection };
    }
    if (request.replayContinuation?.panelGame !== undefined) {
      return { id: request.id, ...(await continuePanelGame(request)) };
    }
    if (request.replayContinuation !== undefined) {
      let first = true;
      const program = parsedProgram(request.program);
      const result = await runReplayContinuation({
        ...request.replayContinuation,
        program,
        choose: (window) => {
          if (first) {
            first = false;
            return request.replayContinuation.action;
          }
          return chooseHeuristic(program, window, request.replayContinuation.sampleSeed);
        },
      });
      return { id: request.id, ...result };
    }
    if (request.replayTeacher !== undefined) {
      const result = await runReplayTeacher({
        ...request.replayTeacher,
        program: parsedProgram(request.program),
      });
      return { id: request.id, valid: true, ...result };
    }
    return await play(request);
  } catch (error) {
    if (request.validate !== undefined) return { id: request.id, error: String(error).slice(0, 300) };
    return { id: request.id, valid: false, win: null, error: String(error).slice(0, 300), ms: 0 };
  }
}

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (!line.trim()) continue;
  write(JSON.stringify(await handle(JSON.parse(line))) + "\n");
}
