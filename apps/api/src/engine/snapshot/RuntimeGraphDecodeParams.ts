import type { RuntimeGraphSnapshot } from "#api/engine/snapshot/RuntimeGraphSnapshot";
import type { RuntimeGraphPorts } from "#api/engine/snapshot/RuntimeGraphPorts";

export type RuntimeGraphDecodeParams = RuntimeGraphPorts & { snapshot: RuntimeGraphSnapshot };
