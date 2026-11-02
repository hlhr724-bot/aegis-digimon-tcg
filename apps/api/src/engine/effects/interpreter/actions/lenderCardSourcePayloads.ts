import type { CardSource } from "#api/engine/effects/CardSource";
import type { LenderCardSourcePayload } from "#api/engine/effects/interpreter/actions/LenderCardSourcePayload";

export const lenderCardSourcePayloads = new WeakMap<CardSource, LenderCardSourcePayload>();
