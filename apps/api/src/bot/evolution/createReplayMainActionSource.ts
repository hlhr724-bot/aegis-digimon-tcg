import type { Seat } from "@aegis/shared/schema/enums";
import type { TrainingAction } from "#api/bot/training/actions";

export function createReplayMainActionSource(input: {
  seat: Seat;
  prefix: readonly { seat: Seat; kind: string; mainActions?: readonly TrainingAction[] }[];
  cursor: () => number;
  enabled: boolean;
  onReuse: () => void;
  onEnumeration: () => void;
}): () => TrainingAction[] | undefined {
  return () => {
    const entry = input.prefix[input.cursor()];
    if (entry?.seat !== input.seat || entry.kind !== "main") return undefined;
    if (!input.enabled) {
      input.onEnumeration();
      return undefined;
    }
    if (entry.mainActions === undefined) throw new Error("Missing exact-prefix main action catalog");
    input.onReuse();
    return structuredClone(entry.mainActions) as TrainingAction[];
  };
}
