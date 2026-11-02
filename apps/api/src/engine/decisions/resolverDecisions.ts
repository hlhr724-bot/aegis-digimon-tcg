import type { ResolutionOrderEntry, Seat, ServerEvent } from "@aegis/shared";
import { EffectTiming } from "@aegis/shared";
import type { CollectedEffect } from "../effects/collect.js";
import type { DecisionManager } from "./index.js";
import type { ResolutionPlan } from "./resolutionPlan.js";
import { triggerKeyOf } from "./triggerKeyOf.js";
import { log } from "../../logger.js";

export interface ResolverDecisions {
  /**
   * Ask the controller which simultaneously-activatable effect to resolve next;
   * the resolver calls this only when multiple effects need ordering. Resolves to
   * its index into `active`, or null only for the manager's timeout/cancellation
   * fallback. With a `plan`, the prompt accepts a full resolution plan and is skipped
   * while the plan already orders every offered effect. `waiting` is shown, never offered.
   */
  chooseOrder(
    seat: Seat,
    active: readonly CollectedEffect[],
    timing?: EffectTiming,
    plan?: ResolutionPlan,
    waiting?: readonly CollectedEffect[],
  ): Promise<number | null>;
  /** Ask the controller whether to use an optional effect (true = use, false = skip), unless `plan` presets it. */
  askOptional(seat: Seat, collected: CollectedEffect, plan?: ResolutionPlan): Promise<boolean>;
}

export function createResolverDecisions(
  manager: DecisionManager,
  beforeRequest: () => Promise<void> = async () => {},
  emit: (event: ServerEvent) => void = () => {},
): ResolverDecisions {
  return {
    async chooseOrder(seat, active, timing, plan, waiting = []) {
      log(
        "[chooseOrder]",
        `seat=${seat} count=${active.length}`,
        active.map((c) => ({ card: c.source.cardId, desc: c.effect.description, optional: c.effect.optional })),
      );
      // Ordering is only a player decision when at least two effects compete for
      // the next slot. Keep this guard even though the stack resolver already skips
      // lone groups so any direct/legacy caller cannot recreate a confirmation-only
      // round trip.
      if (active.length < 2) return active.length === 1 ? 0 : null;
      // The `orderTriggers` decision carries one key per triggering PERMANENT, not per
      // effect: `effect.effectKey` alone is `cardId/effect-index`, shared by every
      // permanent of the same card, so two copies of the same card triggering
      // simultaneously would collide on a single decision entry (the client rendered
      // duplicate React keys and both order buttons toggled the same entry — see
      // packages/shared/src/protocol/triggerKey.ts). `buildTriggerKey` prefixes with
      // the source's `instanceId` to make each entry independently addressable. The
      // controller answers with the key to resolve next, and the resolver re-collects
      // before it offers the remainder. With a plan, the answer may also order the
      // remainder, and later prompts are skipped while an ordered effect is still offered and no new one has triggered. An empty order can only
      // come from timeout/cancellation; it is honored as a decline only when every
      // remaining effect is optional (source
      // `_CanNoSelect: () => active.All(s => s.CardEffect.IsSkippable(...))`).
      // One watcher can be armed by multiple discard events before this prompt.
      // Preserve every activation while keeping React keys and responses unambiguous.
      const usedKeys = new Set<string>();
      const triggerKeys = active.map((c) => {
        const base = plan?.keyFor(c) ?? triggerKeyOf(c);
        let key = base;
        let occurrence = 1;
        while (usedKeys.has(key)) key = `${base}/activation-${++occurrence}`;
        usedKeys.add(key);
        return key;
      });
      const planned = plan?.nextOf(triggerKeys);
      if (planned !== undefined) {
        log("[chooseOrder]", `seat=${seat} planned=${planned}`);
        return triggerKeys.indexOf(planned);
      }
      // A preceding effect may have changed the board and installed a duration-scoped
      // keyword before engine asks which newly-triggered effect resolves next. Publish
      // those derived fields first: the decision itself causes the room to flush state,
      // and clients must not see a legal attacker as summoning-sick during the pause.
      await beforeRequest();
      const triggerCardIds = active.map((c) => c.source.cardId);
      // One permanent can put two effects on the stack at once (Megadramon's [On Play]
      // and [When Digivolving]). They share an instanceId and a card, so the chooser can
      // only name them apart by the window each one fired in.
      const decisionTiming = timing !== undefined ? EffectTiming[timing] : undefined;
      const triggerTimings = active.map(
        (c) =>
          c.effect.timingOverride ??
          c.printedTiming ??
          c.effect.irTrigger ??
          c.timingLabel ??
          (c.timing !== undefined ? EffectTiming[c.timing] : undefined) ??
          decisionTiming ??
          "",
      );
      const triggerReasons = active.map((c) => c.triggerReason ?? "");
      const sharedSourceCardId = triggerCardIds.every((cardId) => cardId === triggerCardIds[0])
        ? triggerCardIds[0]
        : undefined;
      const response = await manager.request({
        seat,
        kind: "orderTriggers",
        promptText: "Choose the next pending effect to resolve.",
        ...(sharedSourceCardId !== undefined ? { sourceCardId: sharedSourceCardId } : {}),
        options: {
          triggerKeys,
          triggerCardIds,
          triggerSummaries: active.map((entry) => entry.effect.decisionSummary ?? null),
          triggerControllerSeats: active.map((entry) => entry.source.ownerSeat),
          triggerDescriptions: active.map((c) => c.effect.description ?? ""),
          ...(triggerReasons.some((reason) => reason !== "") ? { triggerReasons } : {}),
          triggerIsInherited: active.map((c) => c.effect.isInherited),
          ...(plan !== undefined
            ? {
                acceptsResolutionPlan: true,
                acceptsIndexedResolutionPlan: true,
                triggerIsOptional: active.map(mayAskYesNo),
              }
            : {}),
          ...(triggerTimings.some((entry) => entry !== "") ? { triggerTimings } : {}),
          ...(decisionTiming !== undefined ? { timing: decisionTiming } : {}),
          ...(waiting.length > 0
            ? {
                waitingTriggerCardIds: waiting.map((c) => c.source.cardId),
                waitingTriggerDescriptions: waiting.map((c) => c.effect.description ?? ""),
                waitingTriggerIsInherited: waiting.map((c) => c.effect.isInherited),
              }
            : {}),
        },
      });
      if (response.kind !== "orderTriggers") return null;
      if (response.order.length > 0) plan?.adopt(response.order, response.optionalAnswers, triggerKeys);

      const first = response.order[0];
      if (first === undefined) return null; // declined / empty
      const index = triggerKeys.indexOf(first);
      if (index < 0) return null;
      // Only a plan fixes the order of the rest; a single pick says nothing about it.
      const chosenKeys = plan !== undefined ? response.order : [first];
      const entries = chosenKeys.flatMap((key) => {
        const position = triggerKeys.indexOf(key);
        const chosen = position >= 0 ? active[position] : undefined;
        return chosen === undefined ? [] : [publicOrderEntry(chosen, triggerTimings[position] ?? "")];
      });
      emit({ kind: "resolutionOrderChosen", seat, entries });
      return index;
    },

    async askOptional(seat, collected, plan) {
      const preset = plan?.presetFor(plan.keyFor(collected));
      if (preset !== undefined) return preset;
      log(
        "[askOptional]",
        `seat=${seat} card=${collected.source.cardId} desc="${collected.effect.description}" optional=${collected.effect.optional} isSecurity=${collected.effect.isSecurity}`,
      );
      await beforeRequest();
      const response = await manager.request({
        seat,
        kind: "optional",
        promptText: "Use this effect?",
        sourceCardId: collected.source.cardId,
        sourceInstanceId: collected.source.instanceId,
        sourcePermanentId: collected.conferredToPermanentId ?? collected.source.permanent()?.permanentId,
        options: {
          effectText: collected.effect.description,
          ...(collected.effect.activationTextEmphasis === undefined
            ? {}
            : { effectTextEmphasis: collected.effect.activationTextEmphasis }),
          ...(collected.effect.decisionSummary === undefined
            ? {}
            : { effectSummary: collected.effect.decisionSummary, effectControllerSeat: collected.source.ownerSeat }),
          effectKey: collected.effect.effectKey,
          activationConfirmation: true,
          ...(collected.effect.timingOverride !== undefined
            ? { timing: collected.effect.timingOverride }
            : collected.timing !== undefined
              ? { timing: EffectTiming[collected.timing] }
              : {}),
        },
      });
      return response.kind === "optional" ? response.accept : false;
    },
  };
}

/**
 * What the opponent may learn about one pending effect. Its source is named only while that
 * card sits face-up where both players can see it; a card in the hand, the deck or face-down
 * security stays anonymous, down to its clause, which would name it just as well.
 */
function publicOrderEntry(collected: CollectedEffect, timing: string): ResolutionOrderEntry {
  const { source } = collected;
  const visible =
    source.isOnBattleArea() ||
    source.isOnBreedingArea?.() === true ||
    source.isInTrash?.() === true ||
    source.isInSecurity?.() === true;
  return {
    ...(timing !== "" ? { timing } : {}),
    ...(visible
      ? {
          sourceCardId: source.cardId,
          ...(collected.effect.description ? { description: collected.effect.description } : {}),
        }
      : {}),
  };
}

/**
 * Whether an effect can stop to ask its controller yes or no: an optional effect, or printed
 * text with a "may" choice or a "by <doing X>" optional cost. The compiled actions are not
 * reachable from a collected effect, so this reads the clause. It only decides whether the
 * chooser shows the Ask/Yes/No control; a preset on any effect is honored either way.
 *
 * The choice belongs to the controller whatever the subject: "you may", "it may digivolve"
 * (EX12-032), "1 of your Digimon may attack". Only "your opponent may" is theirs.
 */
function mayAskYesNo(collected: CollectedEffect): boolean {
  return collected.effect.optional || effectTextMayAskYesNo(collected.effect.description ?? "");
}

export function effectTextMayAskYesNo(text: string): boolean {
  return /(?<!opponent )\bmay\b/i.test(text) || /\bby [a-z]+ing\b/i.test(text);
}
