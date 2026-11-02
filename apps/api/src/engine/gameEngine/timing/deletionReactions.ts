import { createPendingDeletionEffectReader } from "#api/engine/gameEngine/createPendingDeletionEffectReader";
import { EffectTiming, type CardInstance, type Seat } from "@aegis/shared";
import { definitionOf } from "../../cards/cardData.js";
import type { TriggerInfo } from "../../effects/EffectContext.js";
import { findLooseInstance } from "../intents.js";
import type { GameEngine } from "../../GameEngine.js";
import { shouldDeferNestedTiming } from "../windows.js";
import { armedAsPendingCollected, runSubTriggersInChosenOrder } from "../subTriggers.js";
import type { CollectedEffect } from "../../effects/collect.js";
import { subTriggerIdentity, type ArmedSubTrigger } from "../subTriggerIdentity.js";

/**
 * Resolve the two trigger families created by one deletion. Ascension is deliberately
 * represented in the ordinary orderTriggers channel: if it resolves first, the card leaves
 * trash and the subsequent On Deletion collection correctly drops that pending effect (Q7100).
 *
 * `fire` opens the [On Deletion] window; the pooled rule-check flush substitutes the
 * non-deferring runner so the whole pass resolves as one window.
 */
export async function resolveDeletionReactions(
  engine: GameEngine,
  trigger: TriggerInfo,
  ascensionCandidates: readonly { instanceId: string; seat: Seat }[],
  fire: (deletionTrigger: TriggerInfo, simultaneousPending?: readonly CollectedEffect[]) => Promise<void> = (
    deletionTrigger,
  ) => engine.fireTiming(EffectTiming.OnDestroyedAnyone, deletionTrigger),
  transientCandidates: readonly CardInstance[] = [],
  deferNested = true,
  prearmedDeletionSubTriggers?: readonly ArmedSubTrigger[],
): Promise<void> {
  const deletionSubTriggers =
    prearmedDeletionSubTriggers === undefined
      ? engine.pendingDeletionSubTriggers.splice(0)
      : [...prearmedDeletionSubTriggers];
  const battleWonSubTriggers = engine.pendingBattleWonSubTriggers.splice(0);
  if (engine.activeWindowToken === undefined) deletionSubTriggers.push(...battleWonSubTriggers);
  // A rule-check pass pools every deletion it performs, Ascension offer included, and
  // resolves them as one simultaneous group once the fixpoint converges (§17-1-3,
  // §15-4-3-3). Without engine each sweep would resolve its own [On Deletion] effects
  // before the next sweep even ran.
  if (engine.ruleTriggerPool !== undefined) {
    engine.ruleTriggerPool.push({
      trigger: { ...trigger },
      ascensionCandidates: [...ascensionCandidates],
      transientCandidates: [...transientCandidates],
    });
    return;
  }
  // A deletion inside an effect creates one reaction group. Park Ascension together
  // with On Deletion until that body ends; otherwise Ascension can remove the card
  // from trash before the controller's chosen On Deletion-first order runs.
  if (deferNested && shouldDeferNestedTiming(engine)) {
    // Preserve the specifically grouped battle-winner watchers until this deletion
    // window reaches its between-effects boundary.
    engine.pendingBattleWonSubTriggers = [...battleWonSubTriggers, ...engine.pendingBattleWonSubTriggers];
    engine.deferredTimingWindows.push({
      readPendingEffects: createPendingDeletionEffectReader({ engine, trigger, transientCandidates }),
      timing: EffectTiming.OnDestroyedAnyone,
      trigger: { ...trigger },
      transientCandidates: [...transientCandidates],
      ascensionCandidates: [...ascensionCandidates],
      deletionSubTriggers,
    });
    return;
  }
  const fireWithDeletionSubTriggers = async (): Promise<void> => {
    const simultaneousPending =
      engine.activeWindowToken === undefined ? [] : armedAsPendingCollected(engine, battleWonSubTriggers);
    if (deletionSubTriggers.length === 0) return fire(trigger, simultaneousPending);
    const enclosing = engine.pendingWindowSubTriggers;
    engine.pendingWindowSubTriggers = [...enclosing, ...deletionSubTriggers];
    engine.subTriggerWindowDepth += 1;
    try {
      await fire(trigger, simultaneousPending);
      const remaining = deletionSubTriggers.filter(
        (item) => !engine.consumedSubTriggerKeys.has(subTriggerIdentity(item.sub, item.ctx.trigger)),
      );
      await runSubTriggersInChosenOrder(engine, remaining);
    } finally {
      engine.pendingWindowSubTriggers = enclosing;
      engine.subTriggerWindowDepth -= 1;
      if (engine.subTriggerWindowDepth === 0) engine.consumedSubTriggerKeys.clear();
    }
  };
  const ascensionAnswers = new Map<string, boolean>();
  const ascend = async ({ instanceId, seat }: { instanceId: string; seat: Seat }): Promise<void> => {
    const card = engine.state.players[seat]!.trash.find((candidate) => candidate.instanceId === instanceId);
    if (card === undefined) return;
    let accept = ascensionAnswers.get(instanceId);
    if (accept === undefined) {
      const response = await engine.decisions.request({
        seat,
        kind: "optional",
        promptText: "Activate ＜Ascension＞?",
        sourceCardId: card.cardId,
        sourceInstanceId: instanceId,
        options: {
          timing: "Ascension",
          effectText: "＜Ascension＞: When this card is deleted, you may place it at the top of your security stack.",
        },
      });
      accept = response.kind === "optional" && response.accept;
    }
    if (accept) await engine.primitives.ascendToSecurity(instanceId);
  };

  // Every simultaneously-deleted Ascension candidate that ALSO prints its own [On Deletion]
  // needs its own ascend-vs-on-deletion ordering choice (§15-4-3-4/-3-5) — not just the
  // first one found. A second such candidate in the same batch previously fell through to
  // the plain `ascend()` loop below with no ordering choice at all, always resolving its
  // own [On Deletion] (inside the single shared `fire`) before it could ever be asked to
  // ascend first.
  const selfEffectCandidates = ascensionCandidates.filter(({ instanceId }) => {
    const card = findLooseInstance(engine, instanceId);
    return card !== undefined && definitionOf(card).effectText?.includes("[On Deletion]") === true;
  });
  if (selfEffectCandidates.length === 0) {
    await fireWithDeletionSubTriggers();
    for (const pending of ascensionCandidates) await ascend(pending);
    return;
  }

  const ascendBeforeFire: { instanceId: string; seat: Seat }[] = [];
  const ascendAfterFire: { instanceId: string; seat: Seat }[] = [];
  for (const candidate of selfEffectCandidates) {
    const card = findLooseInstance(engine, candidate.instanceId);
    if (card === undefined) continue;
    const printed = definitionOf(card).effectText ?? "";
    const ascensionKey = `ascension/${candidate.instanceId}`;
    const onDeletionKey = `on-deletion/${candidate.instanceId}`;
    const response = await engine.decisions.request({
      seat: candidate.seat,
      kind: "orderTriggers",
      promptText: "Choose the resolution order for the pending deletion effects.",
      sourceCardId: card.cardId,
      sourceInstanceId: candidate.instanceId,
      options: {
        triggerKeys: [ascensionKey, onDeletionKey],
        triggerCardIds: [card.cardId, card.cardId],
        triggerTimings: ["Ascension", "OnDeletion"],
        triggerDescriptions: [
          "＜Ascension＞: When this card is deleted, you may place it at the top of your security stack.",
          printed.slice(printed.indexOf("[On Deletion]")),
        ],
        acceptsResolutionPlan: true,
        acceptsIndexedResolutionPlan: true,
        // Native On Deletion bodies keep their individual optional choices.
        triggerIsOptional: [true],
      },
    });
    if (response.kind === "orderTriggers" && response.optionalAnswers?.[ascensionKey] !== undefined)
      ascensionAnswers.set(candidate.instanceId, response.optionalAnswers[ascensionKey]);
    const ascensionFirst = response.kind === "orderTriggers" && response.order[0] === ascensionKey;
    (ascensionFirst ? ascendBeforeFire : ascendAfterFire).push(candidate);
  }
  for (const candidate of ascendBeforeFire) await ascend(candidate);
  await fireWithDeletionSubTriggers();
  for (const candidate of ascendAfterFire) await ascend(candidate);
  for (const pending of ascensionCandidates) {
    if (!selfEffectCandidates.some(({ instanceId }) => instanceId === pending.instanceId)) await ascend(pending);
  }
}
