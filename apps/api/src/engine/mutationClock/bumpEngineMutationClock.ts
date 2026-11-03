import { engineMutationClock } from "#api/engine/mutationClock/engineMutationClock";

export function bumpEngineMutationClock(): void {
  engineMutationClock.version++;
  if (engineMutationClock.recomputesInFlight > 0 && engineMutationClock.recomputeScope.getStore() !== true) {
    engineMutationClock.foreignWrites++;
  }
}
