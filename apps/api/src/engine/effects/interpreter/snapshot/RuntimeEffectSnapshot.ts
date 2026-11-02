import type { EffectTiming } from "@aegis/shared/schema/enums";
import type { CardEffect } from "@aegis/shared/effects/ir/card";
import type { CardSource } from "#api/engine/effects/CardSource";
import type { RuntimeCallback } from "#api/engine/snapshot/RuntimeCallback";

export type RuntimeEffectSnapshot = {
  cardId: string;
  timing: EffectTiming;
  index: number;
  source: CardSource;
  definition: CardEffect;
  methods: Map<string, RuntimeCallback>;
};
