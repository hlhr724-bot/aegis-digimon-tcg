import { expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { runBotSearchTask } from "#api/bot/search/runBotSearchTask";
import { currentEpochMs } from "#api/bot/search/currentEpochMs";
import { createCombatRootWindow } from "#api/bot/search/createCombatRootWindow";
import { CombatSearchKind } from "#api/bot/search/CombatSearchKind";
import { DEFAULT_BOT_PROFILE } from "#api/bot/profiles";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { buildBotView } from "#api/bot/view";
import { settle, settleAcrossTimers } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import fixture from "#api/engine/scenarios/start-of-main-attack-block-window.fixture";
import "#api/cards/index";

it("finishes block rollouts after an attack a start-of-main effect declared", async () => {
  const setup = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
  setup.engine.randomStreams = [new SeededRandom({ seed: 71 }), new SeededRandom({ seed: 72 })];
  setup.engine.snapshotContinuation.enable();
  const loop = setup.engine.startTurnLoop();
  await advance(setup.engine).waitForMainPhase(0);
  expect(setup.engine.applyIntent(0, { type: "playCard", instanceId: setup.inst("grantor").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => setup.state.players[0]!.battleArea.length === 1 && setup.state.pendingDecision === undefined);
  advance(setup.engine).endMainPhaseIfOpen(0);
  await settleAcrossTimers(() => setup.events.some((event) => event.kind === "blockWindowOpened"));
  expect(setup.events.some((event) => event.kind === "attackDeclared")).toBe(true);
  const opened = setup.events.find((event) => event.kind === "blockWindowOpened") as Extract<
    ServerEvent,
    { kind: "blockWindowOpened" }
  >;
  const rootData = createCombatRootWindow({
    engine: setup.engine,
    seat: 0,
    baseline: { type: "declineBlock" },
    request: {
      kind: CombatSearchKind.BLOCK.value,
      view: buildBotView(setup.state, 0)!,
      context: {
        attackerPermanentId: opened.attackerPermanentId,
        eligibleBlockerIds: opened.eligibleBlockerIds,
        mustBlock: opened.mustBlock === true,
        targetsPlayer: true,
      },
    },
  });
  const snapshot = JSON.parse(JSON.stringify(snapshotGameEngine({ engine: setup.engine, allowContinuation: true })));
  expect(setup.engine.applyIntent(0, { type: "declineBlock" })).toEqual({ ok: true });
  await settleAcrossTimers(() => setup.state.combatWindow === undefined);
  setup.engine.applyIntent(1, { type: "surrender" });
  await loop.catch(() => undefined);
  expect(rootData).toBeDefined();
  const result = await runBotSearchTask({
    task: {
      snapshot,
      root: rootData!.root,
      seat: 0,
      program: SEED_RESIDUAL,
      opponentProgram: SEED_RESIDUAL,
      profile: DEFAULT_BOT_PROFILE,
      simulations: 4,
      candidateLimit: 8,
      deadlineEpochMs: currentEpochMs() + 60_000,
      seed: 71,
      rootPriors: rootData!.priors,
      seenOpponentCards: { main: [], eggs: [] },
    },
    signal: new AbortController().signal,
  });
  expect(result.report.invalid).toBe(0);
  expect(result.report.completed).toBe(4);
}, 60_000);
