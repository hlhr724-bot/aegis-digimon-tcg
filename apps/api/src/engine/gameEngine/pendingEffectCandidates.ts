import type { DecisionSpec } from "../decisions/index.js";
import type { GameEngine } from "../GameEngine.js";
import { pendingWindowCollected } from "./subTriggers.js";

/** Display provenance only: no event-history guesses or promised effect result. */
export function pendingEffectCandidates(engine: GameEngine, spec: DecisionSpec): string[] {
  const offered = new Set(spec.options?.candidateInstanceIds ?? []);
  const visible = new Set(spec.options?.visibleInstanceIds ?? spec.options?.candidateInstanceIds ?? []);
  const trash = new Set(
    Array.from(engine.state.players).flatMap((player) => Array.from(player.trash, (card) => card.instanceId)),
  );
  if (!offered.size) return [];
  const deletionPending = [
    ...Array.from(engine.pendingEffectReaders).flatMap((read) => [...read()]),
    ...engine.deferredTimingWindows.flatMap((window) => [...(window.readPendingEffects?.() ?? [])]),
  ];
  return [
    ...new Set(
      [...pendingWindowCollected(engine), ...deletionPending].flatMap((pending) => {
        const deletionSource =
          deletionPending.includes(pending) &&
          pending.effect.irTrigger === "OnDeletion" &&
          pending.triggerInfo?.deletedInstanceIds?.includes(pending.source.instanceId) === true;
        const id = deletionSource ? pending.source.instanceId : pending.discardedStackSourceProof?.sourceInstanceId;
        return id !== undefined &&
          id === pending.source.instanceId &&
          offered.has(id) &&
          visible.has(id) &&
          trash.has(id)
          ? [id]
          : [];
      }),
    ),
  ];
}
