import { InterpreterReferenceKind } from "#api/engine/effects/interpreter/snapshot/InterpreterReferenceKind";
import { RuntimeReferenceRegistry } from "#api/engine/snapshot/RuntimeReferenceRegistry";
import { runtimeCompiledNodeRegistry } from "#api/engine/effects/interpreter/snapshot/runtimeCompiledNodeRegistry";
import type { CompiledNodeReference } from "#api/engine/effects/interpreter/snapshot/CompiledNodeReference";

export function createInterpreterRuntimeReferences(): RuntimeReferenceRegistry {
  const references = new RuntimeReferenceRegistry();
  references.registerFactory({
    key: InterpreterReferenceKind.COMPILED_NODE.value,
    describe: (value) => runtimeCompiledNodeRegistry.describe(value),
    beginDecode: () => runtimeCompiledNodeRegistry.beginDecode(),
    resolve: (payload) => {
      if (!isCompiledNodeReference(payload)) {
        throw new Error("Invalid compiled-node reference");
      }
      return runtimeCompiledNodeRegistry.resolve(payload);
    },
  });
  return references;
}

function isCompiledNodeReference(value: unknown): value is CompiledNodeReference {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const reference = value as CompiledNodeReference;
  return (
    typeof reference.cardId === "string" &&
    typeof reference.rootKey === "string" &&
    typeof reference.fingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(reference.fingerprint) &&
    Array.isArray(reference.path) &&
    reference.path.every((part) => typeof part === "string" || (Number.isSafeInteger(part) && part >= 0))
  );
}
