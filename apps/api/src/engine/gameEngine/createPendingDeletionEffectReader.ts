import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { GameEngine } from "#api/engine/GameEngine";
import type { CollectedEffect } from "#api/engine/effects/collect";
import type { TriggerInfo } from "#api/engine/effects/EffectContext";
import { canActivate } from "#api/engine/effects/kernel";
import { collectDeletionPending } from "#api/engine/gameEngine/ruleProcess";

interface Params {
  engine: GameEngine;
  trigger: TriggerInfo;
  transientCandidates: readonly CardInstance[];
}

export function createPendingDeletionEffectReader({
  engine,
  trigger,
  transientCandidates,
}: Params): () => readonly CollectedEffect[] {
  const pending = collectDeletionPending(engine, [
    { trigger, transientCandidates: [...transientCandidates], ascensionCandidates: [] },
  ]);
  return () =>
    pending.filter((collected) => {
      const ctx = engine.buildEffectContext(collected.source, collected.triggerInfo ?? trigger);
      ctx.conferredToPermanentId = collected.conferredToPermanentId;
      ctx.conferralGranterInstanceId = collected.conferralGranterInstanceId;
      return canActivate(collected.effect, ctx, engine.tracker);
    });
}
