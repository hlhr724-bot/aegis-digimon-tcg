import { expect, it } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import { PlayerState } from "@aegis/shared/schema/PlayerState";
import { engineMutationClock } from "#api/engine/mutationClock/engineMutationClock";
import { installSchemaMutationClock } from "#api/engine/mutationClock/installSchemaMutationClock";

it("counts every tracked write to the engine's game state and ignores unchanged values", () => {
  installSchemaMutationClock();
  const state = new GameState();
  const changedBy = (write: () => void) => {
    const before = engineMutationClock.version;
    write();
    return engineMutationClock.version !== before;
  };
  expect(changedBy(() => (state.turnCount = 7))).toBe(true);
  expect(changedBy(() => (state.turnCount = 7))).toBe(false);
  expect(changedBy(() => state.players.push(new PlayerState()))).toBe(true);
  expect(changedBy(() => (state.players[0]!.securityDpDelta = 3))).toBe(true);
  expect(changedBy(() => state.players.splice(0, 1))).toBe(true);
});
