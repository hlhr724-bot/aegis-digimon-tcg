import { expect, it } from "vitest";
import { setupEngine } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { assertEngineSnapshotBoundary } from "#api/engine/snapshot/assertEngineSnapshotBoundary";
import { DeletionMaxDpLedger } from "#api/engine/deletionMaxDp";
import { DpDeleteBudgetLedger } from "#api/engine/dpDeleteBudget";

const activeFields = {
  effectBodyTokens: [1],
  activeWindowToken: 0,
  mainVerbContinuationsInFlight: 1,
  counterResolutionInFlight: true,
  optionResolutionDepth: 1,
  optionMainDepth: 1,
  effectResolutionDepth: 1,
  mainEntryPending: true,
  deferredEndPhaseSeat: 0,
  pendingPoolDrainDepth: 1,
  attackStepPauseDepth: 1,
  subTriggerWindowDepth: 1,
  pendingWindowSubTriggers: [{}],
  pendingDeletionSubTriggers: [{}],
  pendingBattleWonSubTriggers: [{}],
  parkedEntrySubTriggers: [{}],
  pendingNestedTimingEffects: [{}],
  payingPlayCost: true,
  digivolveCostSubTriggers: [],
  pendingPlayCostDeletionEffects: [{}],
  pendingLeaveReplacementEffects: [{}],
  deferredSecurityRemovalTriggers: [{}],
  flushingDeferredSecurityRemovalTriggers: true,
  pendingEffectReaders: new Set([() => []]),
  deferredTimingWindows: [{}],
  flushingDeferredTimingWindows: true,
  pendingPlayReducerPlacements: new Map([["played", []]]),
  preparedDigiXrosCosts: new Map([["played", {}]]),
  pendingSelfReducerRelocations: new Map([["played", []]]),
  pendingBlitzAttack: {},
  recomputeInFlight: Promise.resolve(),
  recomputeQueued: true,
  preventReentryGuard: { activeReplacementKeys: new Set(["replacement"]) },
  decoyCostPermanentIds: new Set(["permanent"]),
  ruleProcessing: true,
  drawingDigivolutionBonus: true,
  turnEndWindowSeat: 0,
  resolvingBarrierSecurityCost: true,
  deferredRuleSubTriggers: [{}],
  ruleTriggerPool: [],
  securityCheckDepth: 1,
  consumedSubTriggerKeys: new Set(["subscription"]),
  manual: {},
};

it("accepts settled production Main and rejects every pending engine owner without mutation", async () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "attacker" }] } });
  setup.state.isFirstPlayersFirstTurn = true;
  const running = setup.engine.turnMachine.runTurn();
  await advance(setup.engine).waitForMainPhase(0);
  expect(() => assertEngineSnapshotBoundary({ engine: setup.engine })).not.toThrow();
  try {
    for (const [key, value] of Object.entries(activeFields)) {
      const previous: unknown = Reflect.get(setup.engine, key);
      Reflect.set(setup.engine, key, value);
      try {
        expect(() => assertEngineSnapshotBoundary({ engine: setup.engine })).toThrow("settled Main input");
        expect(Reflect.get(setup.engine, key)).toBe(value);
      } finally {
        Reflect.set(setup.engine, key, previous);
      }
    }
    Reflect.set(setup.engine, "unclassifiedState", new Map());
    expect(() => assertEngineSnapshotBoundary({ engine: setup.engine })).toThrow("Unclassified");
    Reflect.deleteProperty(setup.engine, "unclassifiedState");
    setup.engine.continuousScope.run(true, () => {
      expect(() => assertEngineSnapshotBoundary({ engine: setup.engine })).toThrow("continuousScope");
    });
    setup.engine.continuousScope.run(false, () => {
      expect(() => assertEngineSnapshotBoundary({ engine: setup.engine })).not.toThrow();
    });
    expect(() => assertEngineSnapshotBoundary({ engine: setup.engine })).not.toThrow();
  } finally {
    setup.state.gameOver = true;
    setup.engine.mainPhase.abort();
    await running;
  }
  expect(() => assertEngineSnapshotBoundary({ engine: setup.engine })).toThrow("settled Main");
});

it("rejects a phase label that has no resumable production turn", () => {
  const setup = setupEngine();
  expect(() => assertEngineSnapshotBoundary({ engine: setup.engine })).toThrow("mainClosed");
});

it("restores independent deletion maximum and budget maps and validates before mutation", () => {
  const maximum = new DeletionMaxDpLedger();
  maximum.addOwnerWide(0, 2000);
  maximum.addOwnerWide(1, -1000);
  maximum.addSelf("source", 3000);
  const maximumSnapshot = JSON.parse(JSON.stringify(maximum.snapshot()));
  const restoredMaximum = new DeletionMaxDpLedger();
  restoredMaximum.addSelf("old", 9000);
  restoredMaximum.restore(maximumSnapshot);
  expect(restoredMaximum.bonusFor(0, "source")).toBe(5000);
  expect(restoredMaximum.bonusFor(1, "source")).toBe(2000);
  expect(restoredMaximum.bonusFor(1, "old")).toBe(-1000);
  maximum.clear();
  maximumSnapshot.ownerWide[0][1] = 100000;
  expect(restoredMaximum.bonusFor(0, "source")).toBe(5000);
  const before = restoredMaximum.snapshot();
  expect(() => restoredMaximum.restore({ ownerWide: [[0, 1]], bySourcePermanent: [["bad", NaN]] })).toThrow(
    "Invalid deletion maximum",
  );
  expect(() =>
    restoredMaximum.restore({
      ownerWide: [
        [0, 1],
        [0, 2],
      ],
      bySourcePermanent: [],
    }),
  ).toThrow("Invalid deletion maximum");
  expect(restoredMaximum.snapshot()).toEqual(before);

  const budget = new DpDeleteBudgetLedger();
  budget.add("source", 3000);
  budget.add("source", -1000);
  const budgetSnapshot = JSON.parse(JSON.stringify(budget.snapshot()));
  const restoredBudget = new DpDeleteBudgetLedger();
  restoredBudget.add("old", 9000);
  restoredBudget.restore(budgetSnapshot);
  budget.clear();
  budgetSnapshot[0][1] = 100000;
  expect(restoredBudget.bonusFor("source")).toBe(2000);
  expect(restoredBudget.bonusFor("old")).toBe(0);
  expect(() =>
    restoredBudget.restore([
      ["source", 2],
      ["source", 3],
    ]),
  ).toThrow("Invalid deletion budget");
  expect(() =>
    restoredBudget.restore([
      ["source", 2],
      ["bad", Infinity],
    ]),
  ).toThrow("Invalid deletion budget");
  expect(restoredBudget.bonusFor("source")).toBe(2000);
});
