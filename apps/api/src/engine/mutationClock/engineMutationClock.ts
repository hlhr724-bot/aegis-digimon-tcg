import { AsyncLocalStorage } from "node:async_hooks";

export const engineMutationClock = {
  version: 0,
  foreignWrites: 0,
  recomputesInFlight: 0,
  recomputeScope: new AsyncLocalStorage<true>(),
};
