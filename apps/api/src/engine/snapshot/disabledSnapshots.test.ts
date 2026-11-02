import { expect, it } from "vitest";
import { setupEngine } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";

it("refuses to snapshot a rollout engine that stopped tracking runtime objects", async () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "attacker" }] } });
  setup.state.isFirstPlayersFirstTurn = true;
  setup.engine.randomStreams = [new SeededRandom({ seed: 41 }), new SeededRandom({ seed: 42 })];
  const running = setup.engine.turnMachine.runTurn();
  await advance(setup.engine).waitForMainPhase(0);
  expect(() => snapshotGameEngine({ engine: setup.engine })).not.toThrow();
  setup.engine.runtimeObjects.disableSnapshots();
  expect(() => snapshotGameEngine({ engine: setup.engine })).toThrow(
    "Engine snapshots are disabled for this rollout engine",
  );
  expect(setup.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await running;
});
