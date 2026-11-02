import { expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { runBotSearchTask } from "#api/bot/search/runBotSearchTask";
import type { BotSearchTask } from "#api/bot/search/BotSearchTask";
import { currentEpochMs } from "#api/bot/search/currentEpochMs";
import { createCombatRootWindow } from "#api/bot/search/createCombatRootWindow";
import { CombatSearchKind } from "#api/bot/search/CombatSearchKind";
import type { CombatSearchRequest } from "#api/bot/search/CombatSearchRequest";
import { DEFAULT_BOT_PROFILE } from "#api/bot/profiles";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { buildBotView } from "#api/bot/view";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import type { BoardSpec } from "#api/engine/scenario/board";
import { advance } from "#api/engine/testkit/advance";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";

type CombatScenario = { kind: CombatSearchKind; defender: NonNullable<BoardSpec[0]> };

async function createCombatSearchTask({ kind, defender }: CombatScenario): Promise<BotSearchTask> {
  const setup = setupEngine({
    0: defender,
    1: {
      battleArea: [{ card: "BT1-009", as: "attacker" }],
      security: ["BT1-009"],
      deck: ["BT1-013", "BT1-014", "BT1-015"],
    },
  });
  setup.state.turnSeat = 1;
  setup.engine.randomStreams = [new SeededRandom({ seed: 91 }), new SeededRandom({ seed: 92 })];
  setup.engine.snapshotContinuation.enable();
  const loop = setup.engine.startTurnLoop();
  await advance(setup.engine).waitForMainPhase(1);
  expect(
    setup.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: setup.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  const windowEvent = kind === CombatSearchKind.BLOCK.value ? "blockWindowOpened" : "counterWindowOpened";
  await settle(() => setup.events.some((event) => event.kind === windowEvent));
  const opened = setup.events.find((event) => event.kind === windowEvent) as ServerEvent;
  const view = buildBotView(setup.state, 0)!;
  const request: CombatSearchRequest =
    opened.kind === "blockWindowOpened"
      ? {
          kind: CombatSearchKind.BLOCK.value,
          view,
          context: {
            attackerPermanentId: opened.attackerPermanentId,
            eligibleBlockerIds: opened.eligibleBlockerIds,
            mustBlock: opened.mustBlock === true,
            targetsPlayer: true,
          },
        }
      : {
          kind: CombatSearchKind.COUNTER.value,
          view,
          context: opened as Extract<ServerEvent, { kind: "counterWindowOpened" }>,
        };
  const rootData = createCombatRootWindow({
    engine: setup.engine,
    seat: 0,
    baseline: request.kind === CombatSearchKind.BLOCK.value ? { type: "declineBlock" } : { type: "respondCounter" },
    request,
  });
  const snapshot = JSON.parse(JSON.stringify(snapshotGameEngine({ engine: setup.engine, allowContinuation: true })));
  setup.engine.applyIntent(1, { type: "surrender" });
  await loop.catch(() => undefined);
  expect(rootData).toBeDefined();
  expect(snapshot.continuation?.inputs.length).toBeGreaterThan(0);
  return {
    snapshot,
    root: rootData!.root,
    seat: 0,
    program: SEED_RESIDUAL,
    opponentProgram: SEED_RESIDUAL,
    profile: DEFAULT_BOT_PROFILE,
    simulations: 4,
    candidateLimit: 8,
    deadlineEpochMs: currentEpochMs() + 60_000,
    seed: 91,
    rootPriors: rootData!.priors,
    seenOpponentCards: { main: [], eggs: [] },
  };
}

it("searches an open block window from a continuation snapshot with valid rollouts for every candidate", async () => {
  const task = await createCombatSearchTask({
    kind: CombatSearchKind.BLOCK.value,
    defender: {
      battleArea: [{ card: "BT20-047", as: "blocker", dp: 7000 }],
      security: ["BT1-009", "BT1-010"],
      deck: ["BT1-013", "BT1-014", "BT1-015"],
    },
  });
  expect(task.root.kind).toBe("block");
  expect(task.root.actions.map((action) => action.intent.type)).toEqual(["declineBlock", "declareBlock"]);
  const result = await runBotSearchTask({ task, signal: new AbortController().signal });
  expect(result.report.invalid).toBe(0);
  expect(result.report.completed).toBe(4);
  expect(task.root.actions[result.action]).toBeDefined();
}, 120_000);

it("searches an open Counter window from a continuation snapshot with valid rollouts for every candidate", async () => {
  const task = await createCombatSearchTask({
    kind: CombatSearchKind.COUNTER.value,
    defender: {
      battleArea: [
        { card: "BT1-021", as: "redBaseOne" },
        { card: "BT1-022", as: "redBaseTwo" },
      ],
      hand: [{ card: "AD1-005", as: "gaiamon" }],
      security: ["BT1-009", "BT1-010"],
      deck: ["BT1-013", "BT1-014", "BT1-015"],
    },
  });
  expect(task.root.kind).toBe("counter");
  expect(task.root.actions.length).toBeGreaterThan(1);
  const result = await runBotSearchTask({ task, signal: new AbortController().signal });
  expect(result.report.invalid).toBe(0);
  expect(result.report.completed).toBeGreaterThan(0);
  expect(task.root.actions[result.action]).toBeDefined();
}, 120_000);
