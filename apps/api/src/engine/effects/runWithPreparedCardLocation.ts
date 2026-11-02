import type { GameState } from "@aegis/shared/schema/GameState";
import { preparedCardLocation } from "#api/engine/effects/preparedCardLocation";

type RunWithPreparedCardLocationParams<T> = {
  state: GameState;
  execute: () => T;
};

export function runWithPreparedCardLocation<T>({ state, execute }: RunWithPreparedCardLocationParams<T>): T {
  const previousState = preparedCardLocation.state;
  const previousId = preparedCardLocation.instanceId;
  const previousLocation = preparedCardLocation.location;
  preparedCardLocation.state = state;
  preparedCardLocation.instanceId = undefined;
  preparedCardLocation.location = undefined;
  try {
    return execute();
  } finally {
    preparedCardLocation.state = previousState;
    preparedCardLocation.instanceId = previousId;
    preparedCardLocation.location = previousLocation;
  }
}
