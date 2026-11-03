import { ChangeTree } from "@colyseus/schema";
import { bumpEngineMutationClock } from "#api/engine/mutationClock/bumpEngineMutationClock";

const RECORDING_METHODS = [
  "change",
  "indexedOperation",
  "delete",
  "operation",
  "insertAt",
  "removeAt",
  "unshift",
  "markDirty",
] as const;

let installed = false;

export function installSchemaMutationClock(): void {
  if (installed) return;
  installed = true;
  const prototype = ChangeTree.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of RECORDING_METHODS) {
    const original = prototype[name];
    if (typeof original !== "function") throw new Error(`Schema change tracker has no ${name} method`);
    prototype[name] = function (this: unknown, ...args: unknown[]) {
      bumpEngineMutationClock();
      return original.apply(this, args);
    };
  }
}
