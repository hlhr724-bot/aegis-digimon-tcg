import { expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { setupEngine } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import type { GameEngineHooks } from "#api/engine/GameEngine";
import { prepareGameEngineRestore } from "#api/engine/snapshot/prepareGameEngineRestore";
import { restoreGameEngine } from "#api/engine/snapshot/restoreGameEngine";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";

async function settledMainSnapshot() {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "attacker" }], hand: ["BT1-085", "BT1-084"] } });
  setup.state.isFirstPlayersFirstTurn = true;
  setup.engine.randomStreams = [new SeededRandom({ seed: 7 }), new SeededRandom({ seed: 8 })];
  void setup.engine.turnMachine.runTurn();
  await advance(setup.engine).waitForMainPhase(0);
  return JSON.parse(JSON.stringify(snapshotGameEngine({ engine: setup.engine })));
}

function recordingHooks(events: ServerEvent[]): GameEngineHooks {
  return { seed: 1, emit: (event) => events.push(event), requestDecision: () => undefined };
}

it("restores the same engine from a prepared snapshot as from the full graph", async () => {
  const snapshot = await settledMainSnapshot();
  const prepared = prepareGameEngineRestore({ snapshot });
  expect(prepared).toBeDefined();
  const fullEvents: ServerEvent[] = [];
  const preparedEvents: ServerEvent[] = [];
  const full = restoreGameEngine({ snapshot, hooks: recordingHooks(fullEvents) });
  const fromPrepared = restoreGameEngine({ snapshot, hooks: recordingHooks(preparedEvents), prepared });
  await Promise.all([full.ready, fromPrepared.ready]);
  expect(JSON.stringify(snapshotGameEngine({ engine: fromPrepared.engine }).graph)).toBe(
    JSON.stringify(snapshotGameEngine({ engine: full.engine }).graph),
  );
  expect(full.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  expect(fromPrepared.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await Promise.all([full.completion, fromPrepared.completion]);
  expect(preparedEvents).toEqual(fullEvents);
  expect(fromPrepared.engine.state.toJSON()).toEqual(full.engine.state.toJSON());
});

it("keeps every prepared restore independent of the prepared state and of each other", async () => {
  const snapshot = await settledMainSnapshot();
  const prepared = prepareGameEngineRestore({ snapshot })!;
  const pristine = JSON.stringify(prepared.state.toJSON());
  const first = restoreGameEngine({ snapshot, hooks: recordingHooks([]), prepared });
  const second = restoreGameEngine({ snapshot, hooks: recordingHooks([]), prepared });
  await Promise.all([first.ready, second.ready]);
  expect(first.engine.state).not.toBe(prepared.state);
  expect(first.engine.state.players[0]).not.toBe(second.engine.state.players[0]);
  first.engine.state.players[0]!.hand.splice(0, 1);
  first.engine.state.players[0]!.memory = 9;
  expect(second.engine.state.players[0]!.hand.length).toBe(2);
  expect(JSON.stringify(prepared.state.toJSON())).toBe(pristine);
});

it("refuses a prepared restore made from a different snapshot", async () => {
  const snapshot = await settledMainSnapshot();
  const prepared = prepareGameEngineRestore({ snapshot })!;
  const copy = JSON.parse(JSON.stringify(snapshot));
  expect(() => restoreGameEngine({ snapshot: copy, hooks: recordingHooks([]), prepared })).toThrow(
    "different snapshot",
  );
});
