import type { Seat } from "@aegis/shared/schema/enums";

export type MemoryGaugeSnapshot = { version: 1; turnEndMinMemoryOverrides: readonly (readonly [Seat, number])[] };
