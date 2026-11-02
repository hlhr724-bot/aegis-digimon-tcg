import type { CardSource } from "#api/engine/effects/CardSource";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";

export const sourceRuntimeObjectRegistries = new WeakMap<CardSource, RuntimeObjectRegistry>();
