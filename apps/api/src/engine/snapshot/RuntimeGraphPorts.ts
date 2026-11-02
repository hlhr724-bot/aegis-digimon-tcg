import type { RuntimeReferenceRegistry } from "#api/engine/snapshot/RuntimeReferenceRegistry";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";
import type { RuntimeCallbackDescriptor } from "#api/engine/snapshot/RuntimeCallbackDescriptor";

export type RuntimeGraphPorts = {
  createCallback?: (descriptor: RuntimeCallbackDescriptor) => RuntimeCallback;
  objects?: RuntimeObjectRegistry;
  references?: RuntimeReferenceRegistry;
};
