import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import { PrimitiveCallbackKind } from "#api/engine/effects/verbs/snapshot/PrimitiveCallbackKind";
import { createDelayedMemoryBody } from "#api/engine/effects/verbs/snapshot/createDelayedMemoryBody";

type Params = { engine: GameEngine };
type MemoryPayload = { seat: Seat; amount: number };

export function registerPrimitiveRuntimeCallbacks({ engine }: Params): void {
  engine.runtimeCallbacks.registerFactory({
    key: PrimitiveCallbackKind.DELAYED_MEMORY.value,
    create: (payload) => {
      if (payload === null || typeof payload !== "object") {
        throw new Error("Invalid delayed memory payload");
      }
      const { seat, amount } = payload as MemoryPayload;
      if ((seat !== 0 && seat !== 1) || !Number.isFinite(amount)) {
        throw new Error("Invalid delayed memory payload");
      }
      return createDelayedMemoryBody({ memory: engine.memory, seat, amount });
    },
  });
}
