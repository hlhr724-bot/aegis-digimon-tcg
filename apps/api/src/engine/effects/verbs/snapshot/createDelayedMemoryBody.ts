import type { Seat } from "@aegis/shared/schema/enums";
import type { MemoryPort } from "#api/engine/effects/verbs/types";

type Params = { memory: MemoryPort; seat: Seat; amount: number };

export function createDelayedMemoryBody({ memory, seat, amount }: Params): () => Promise<void> {
  return async () => {
    memory.addMemoryForSeat(seat, amount, "gainMemory", { isTamerEffect: false });
  };
}
