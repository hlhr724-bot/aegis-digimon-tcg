import type { Permanent, PreventionKeyword, Seat, ZoneRef } from "@aegis/shared";
import type { EffectContext, RemovalCause } from "./EffectContext.js";
import type { ReplacementId, ReplacementSubscription, SubTriggerRegistry } from "./subtriggers.js";
import { KeywordReaction } from "#api/engine/effects/KeywordReaction";
import { isKeywordReactionPrecedingCardReactions } from "#api/engine/effects/isKeywordReactionPrecedingCardReactions";
const keywordReactionIdentities = new Set<string>(Object.values(KeywordReaction).map((reaction) => reaction.value));

function replacementActivationKey(replacement: ReplacementSubscription): string {
  const source = replacement.sourceInstanceId ?? replacement.sourcePermanentId ?? "unanchored";
  const action = replacement.activationIdentity ?? `subscription-${replacement.id}`;
  return `${source}:${action}`;
}

/** The affected player's plan for simultaneous leave reactions. */
export interface OrderedReplacements {
  order: ReplacementSubscription[];
  /** Preset yes/no answers by replacement id, for the reactions the player set one on. */
  presetAnswers?: ReadonlyMap<ReplacementId, boolean>;
}

/**
 * The narrow seam the leave-prevention consult needs from its host engine
 * (subsystem: delayed-and-rule-effects). Kept tiny so the consult can be unit-tested
 * against a fake without standing up a whole GameEngine.
 */
export interface LeavePreventionHost {
  subTriggers: SubTriggerRegistry;
  /** Live keyword reactions use the same ordering and reentry guards as authored effects. */
  keywordReplacements?(permanentIds: string[]): ReplacementSubscription[];
  keywordPreventionReplacements?(permanentIds: string[], interruptsEffect: boolean): ReplacementSubscription[];
  /** The live permanent for an id (undefined when it already left). */
  permanentById(permanentId: string): Permanent | undefined;
  /** Build the reaction's EffectContext for a source permanent (with the leaving id in trigger). */
  buildContext(sourcePermanent: Permanent, leavingPermanentId: string): EffectContext;
  buildInstanceContext?(sourceInstanceId: string, leavingPermanentId: string): EffectContext | undefined;
  /** The active turn seat — the default resolving controller for an effect-driven removal. */
  turnSeat: Seat;
  /** Whether a once-per-turn prevention key has already fired this turn (resets each turn). */
  oncePerTurnFired?(key: string): boolean;
  /** Record that a once-per-turn prevention key fired this turn. */
  markOncePerTurnFired?(key: string): void;
  /**
   * Resolve an "instead" body as its own announced effect resolution (see
   * `resolveLeaveReplacementBody`), so each reaction reaches the players as a separate effect.
   */
  resolveInsteadBody?<T>(replacement: ReplacementSubscription, ctx: EffectContext, body: () => Promise<T>): Promise<T>;
  resolvePreventBody?<T>(body: () => Promise<T>): Promise<T>;
  /** Let the affected player order simultaneous non-preventing and preventing leave reactions. */
  orderReplacements?(replacements: ReplacementSubscription[], seat: Seat): Promise<OrderedReplacements>;
  /**
   * Announce a keyword prevention that paid and succeeded. Only the keyword reactions carry an
   * `activationIdentity`, and only they need this: an authored card's replacement already
   * narrates itself through its own effect events.
   */
  keywordPrevented?(
    activationIdentity: string | undefined,
    sourcePermanentId: string | undefined,
    sourceCardId: string | undefined,
    savedPermanentId: string,
    preventionKeyword: PreventionKeyword | undefined,
  ): void;
}

/**
 * Consult active "prevent"/"instead" leave/delete replacements for the permanents about to be
 * removed (the D_leave_area_prevent family). For each leaving permanent:
 *
 * - "instead" reactions (＜Decode＞, BT20-091's "you may play 1 [Omekamon]") gate on
 *   `causeAllows` + `appliesTo` (+ `oncePerTurnKey`) and run `apply`. Side-effect-only reactions
 *   let the leave continue; true relocation replacements add the permanent to the returned set.
 * - "prevent" reactions then run in order: each must (a) allow the removal CAUSE (a "by an
 *   opponent's effect" reaction must not fire on the controller's own deletion; "other than by
 *   battle" must not fire on combat), (b) PROTECT that permanent (self-reaction => only its own
 *   source; a filtered reaction => any matching permanent), and (c) successfully run its
 *   preventCheck (prompt + pay the all-or-nothing cost). Each eligible prevention may pay its
 *   own cost for the same leave event; once-per-turn and re-entry keys still gate reactivation.
 *
 * When both modes apply, the affected player orders the reactions. Returns the subset whose
 * original removal was prevented or superseded by a true relocation replacement.
 *
 * `affectsAll` reactions ("they don't leave") pay once and then save every matching permanent
 * in the same consult; `affectsAll:false` ("1 of those doesn't leave") pays per saved
 * permanent. The shared `reentryGuard` suppresses only the replacement already resolving, so a
 * prevention cost that deletes another protected permanent may activate that other permanent's
 * distinct immediate effect while the original cannot recursively reactivate (BT11-040 Q2074).
 */
export async function consultLeavePrevention(
  host: LeavePreventionHost,
  permanentIds: string[],
  cause: RemovalCause,
  resolvingSeat: Seat | undefined,
  opts: {
    isBounce?: boolean;
    /** Actual movement destination, separate from the removal's cause. */
    destination?: ZoneRef;
    /** DigiXros/material declarations are player actions, not an effect owned by the player. */
    playerAction?: boolean;
    /** DigiXros material relocation is a player action that bypasses "other than DigiXros" clauses. */
    isDigiXros?: boolean;
    /**
     * Run only the "instead" (side-effect) replacements and offer no prevention. Used after a
     * keyword prevention (＜Barrier＞) already stopped the leave: preventing it does not cancel
     * the same event's sibling replacement, which is still offered (KB Q6250).
     */
    insteadOnly?: boolean;
    keywordPreventions?: { interruptsEffect: boolean };
    holdTriggered?: boolean;
    holdCardTriggered?: boolean;
    reentryGuard: { activeReplacementKeys: Set<string> };
  },
): Promise<Set<string>> {
  const prevented = new Set<string>();
  // wouldLeavePlay covers any leave (delete + hand/deck bounce); wouldBeDeleted watches
  // deletion ONLY — a bounce must NOT trigger a deletion-only reaction (BT9-044, RB1-016).
  // replacementsFor already excludes "reduceCost" (unrelated to leave/delete), leaving the
  // "prevent" and "instead" modes this consult handles.
  const keywordPreventions =
    opts.keywordPreventions === undefined || opts.isBounce === true
      ? []
      : (host.keywordPreventionReplacements?.(permanentIds, opts.keywordPreventions.interruptsEffect) ?? []);
  let replacements = [
    ...keywordPreventions.filter((replacement) =>
      isKeywordReactionPrecedingCardReactions(replacement.activationIdentity),
    ),
    ...(host.keywordReplacements?.(permanentIds) ?? []),
    ...(opts.isBounce === true ? [] : host.subTriggers.replacementsFor("wouldBeDeleted")),
    ...host.subTriggers.replacementsFor("wouldLeavePlay"),
    ...keywordPreventions.filter(
      (replacement) => !isKeywordReactionPrecedingCardReactions(replacement.activationIdentity),
    ),
  ];
  if (replacements.length === 0) return prevented;
  const seat =
    opts.playerAction === true ? undefined : (resolvingSeat ?? (cause === "byEffect" ? host.turnSeat : undefined));
  const firedAll = new Set<ReplacementId>();
  const declinedAll = new Set<ReplacementId>();
  const resolvedOneOf = new Set<ReplacementId>();
  const protectsAnotherLeaving = (repl: ReplacementSubscription, ctx: EffectContext, leavingId: string) =>
    repl.mode === "prevent" &&
    repl.affectsAll === true &&
    repl.protects !== undefined &&
    permanentIds.some(
      (candidateId) =>
        candidateId !== leavingId &&
        !prevented.has(candidateId) &&
        host.permanentById(candidateId) !== undefined &&
        repl.protects!(ctx, candidateId),
    );
  for (const leavingId of permanentIds) {
    if (prevented.has(leavingId)) continue;
    const leaving = host.permanentById(leavingId);
    if (leaving === undefined) continue;
    const eligible: {
      repl: ReplacementSubscription;
      ctx: EffectContext;
      activationKey: string;
      sourceTopInstanceId?: string;
      sourceCardId?: string;
      sourceRole?: "top" | "stack" | "linked";
      sourceFaceUp?: boolean;
    }[] = [];
    for (const repl of replacements) {
      if (repl.mode !== "instead" && repl.mode !== "prevent") continue;
      if (opts.isDigiXros === true && repl.exceptDigiXros === true) continue;
      if (opts.insteadOnly === true && repl.mode !== "instead") continue;
      if (repl.mode === "prevent" && repl.preventOneOf !== undefined && resolvedOneOf.has(repl.id)) continue;
      if (declinedAll.has(repl.id)) continue;
      const activationKey = replacementActivationKey(repl);
      if (opts.reentryGuard.activeReplacementKeys.has(activationKey)) continue;
      if (repl.sourcePermanentId === undefined && repl.sourceInstanceId === undefined) continue;
      if (
        repl.causeAllows &&
        !repl.causeAllows(
          cause,
          seat,
          opts.isBounce === true,
          opts.destination ?? (opts.isBounce === true ? undefined : "trash"),
        )
      )
        continue;
      const srcPerm = repl.sourcePermanentId === undefined ? undefined : host.permanentById(repl.sourcePermanentId);
      if (srcPerm === undefined && repl.sourceInstanceId === undefined) continue;
      if (srcPerm !== undefined && srcPerm.topCard === undefined) continue;
      if (repl.oncePerTurnKey !== undefined && host.oncePerTurnFired?.(repl.oncePerTurnKey)) continue;
      // A replacement anchored to a permanent BUT printed on one of its digivolution (or
      // linked) cards has to resolve as that card: `ctx.source` is what every prompt this
      // clause raises names, and the permanent's top card is a different Digimon whose own
      // printed text has nothing to do with the clause being applied.
      const printedOnStackCard =
        srcPerm !== undefined &&
        repl.sourceInstanceId !== undefined &&
        srcPerm.topCard?.instanceId !== repl.sourceInstanceId;
      const ctx =
        srcPerm !== undefined && !printedOnStackCard
          ? host.buildContext(srcPerm, leavingId)
          : (host.buildInstanceContext?.(repl.sourceInstanceId!, leavingId) ??
            (srcPerm === undefined ? undefined : host.buildContext(srcPerm, leavingId)));
      if (ctx === undefined) continue;
      if (repl.mode === "instead") {
        if (repl.appliesTo && !repl.appliesTo(ctx, leavingId)) continue;
      } else if (repl.protects && !repl.protects(ctx, leavingId) && !protectsAnotherLeaving(repl, ctx, leavingId))
        continue;
      const sourceRole =
        repl.sourceInstanceId === undefined || srcPerm === undefined
          ? undefined
          : srcPerm.topCard?.instanceId === repl.sourceInstanceId
            ? "top"
            : srcPerm.stack.some((card) => card.instanceId === repl.sourceInstanceId)
              ? "stack"
              : srcPerm.linked.some((card) => card.instanceId === repl.sourceInstanceId)
                ? "linked"
                : undefined;
      const sourceCard =
        srcPerm === undefined || repl.sourceInstanceId === undefined
          ? undefined
          : [srcPerm.topCard, ...srcPerm.stack, ...srcPerm.linked].find(
              (card) => card?.instanceId === repl.sourceInstanceId,
            );
      // A face-down inherited/linked card has no available effect text. Instance-only
      // delayed reactions have no permanent source to inspect and retain their existing
      // lifecycle; physical role validation applies only to source-backed subscriptions.
      if (
        srcPerm !== undefined &&
        repl.sourceInstanceId !== undefined &&
        (sourceRole === undefined || sourceCard?.faceUp !== true)
      )
        continue;
      eligible.push({
        repl,
        ctx,
        activationKey,
        sourceTopInstanceId: srcPerm?.topCard?.instanceId,
        sourceCardId: sourceCard?.cardId ?? srcPerm?.topCard?.cardId,
        sourceRole,
        sourceFaceUp: sourceCard?.faceUp,
      });
    }

    let ordered = eligible;
    // Simultaneous leave reactions resolve in the affected player's order (KB Q6884). Order
    // matters even between two "instead" reactions: one that relocates the leaving permanent
    // ends the event before the rest are reached (KB Q5352). The chooser's answer moves the
    // picked replacement to the front; an unanswered or empty response keeps the offered order.
    if (host.orderReplacements !== undefined && eligible.length > 1) {
      const plan = await host.orderReplacements(
        eligible.map(({ repl }) => repl),
        leaving.controllerSeat,
      );
      const byId = new Map(eligible.map((candidate) => [candidate.repl.id, candidate]));
      ordered = plan.order.map((replacement) => byId.get(replacement.id)).filter((value) => value !== undefined);
      // A preset answers only the chooser's own reactions; an opponent's card still asks them.
      for (const { repl, ctx } of ordered) {
        const preset = plan.presetAnswers?.get(repl.id);
        if (preset !== undefined && ctx.source.ownerSeat === leaving.controllerSeat) ctx.presetOptionalAnswer = preset;
      }
    }

    for (const { repl, ctx, activationKey, sourceTopInstanceId, sourceCardId, sourceRole, sourceFaceUp } of ordered) {
      if (host.permanentById(leavingId) === undefined) break;
      if (opts.reentryGuard.activeReplacementKeys.has(activationKey)) continue;
      if (declinedAll.has(repl.id)) continue;
      // A replacement body may resolve another effect before its sibling is reached. If
      // that effect removes or evolves the replacement source, the earlier eligibility
      // snapshot is stale and the sibling must not resolve against its old context. Delayed
      // instance-anchored reactions (for example a Security card already in trash) have no
      // permanent source to revalidate and retain their existing lifecycle.
      if (repl.sourcePermanentId !== undefined) {
        const liveSource = host.permanentById(repl.sourcePermanentId);
        if (liveSource === undefined) continue;
        // A top-card anchored effect is lost when that top becomes a new card. An
        // inherited/linked effect remains valid only in the same physical role; promotion
        // to top or detaching a link changes the source card's effect status.
        if (sourceRole === "top" || repl.sourceInstanceId === undefined) {
          if (liveSource.topCard?.instanceId !== sourceTopInstanceId) continue;
        }
        if (
          repl.sourceInstanceId !== undefined &&
          (sourceRole === undefined ||
            (sourceRole === "stack" && !liveSource.stack.some((card) => card.instanceId === repl.sourceInstanceId)) ||
            (sourceRole === "linked" && !liveSource.linked.some((card) => card.instanceId === repl.sourceInstanceId)))
        )
          continue;
        if (
          repl.sourceInstanceId !== undefined &&
          sourceFaceUp !== undefined &&
          ![liveSource.topCard, ...liveSource.stack, ...liveSource.linked].some(
            (card) => card?.instanceId === repl.sourceInstanceId && card.faceUp === sourceFaceUp,
          )
        )
          continue;
      }
      // Recheck the event predicate after any earlier sibling has resolved. Immediate
      // effects are evaluated against the live state at activation; a nested body can
      // change the leaving card or the protected set before this sibling is reached.
      if (repl.mode === "instead" && repl.appliesTo !== undefined && !repl.appliesTo(ctx, leavingId)) continue;
      const protectsLeaving = repl.mode !== "prevent" || repl.protects === undefined || repl.protects(ctx, leavingId);
      if (repl.mode === "prevent" && !protectsLeaving && !protectsAnotherLeaving(repl, ctx, leavingId)) continue;
      if (repl.mode === "instead") {
        if (repl.oncePerTurnKey !== undefined && host.oncePerTurnFired?.(repl.oncePerTurnKey)) continue;
        opts.reentryGuard.activeReplacementKeys.add(activationKey);
        let activated: boolean | void;
        try {
          activated = await (host.resolveInsteadBody?.(repl, ctx, () => repl.apply(ctx)) ?? repl.apply(ctx));
        } finally {
          opts.reentryGuard.activeReplacementKeys.delete(activationKey);
        }
        const relocated = host.permanentById(leavingId) === undefined;
        if (activated !== false && repl.oncePerTurnKey !== undefined) {
          host.markOncePerTurnFired?.(repl.oncePerTurnKey);
        }
        if (relocated) {
          prevented.add(leavingId);
          break;
        }
        // A reaction that leaves the permanent in place (BT20-091 Cool Boy plays an Omekamon)
        // does not use up the leave event: every other card that triggered on it still
        // activates (KB Q5437, Q7374), and so does a sibling prevention (KB Q6250).
        continue;
      }
      // Q4261/Q4262: each eligible prevention may pay for the same leave event. The
      // activation key/reentry guard still prevents only the replacement already resolving
      // from recursively re-entering itself.
      if (repl.mode !== "prevent") continue;
      const announce = (savedId: string) => {
        if (repl.activationIdentity === undefined && repl.preventionKeyword === undefined) return;
        host.keywordPrevented?.(
          repl.activationIdentity,
          repl.sourcePermanentId,
          sourceCardId,
          savedId,
          repl.preventionKeyword,
        );
      };
      if (repl.preventOneOf !== undefined) {
        if (resolvedOneOf.has(repl.id)) continue;
        resolvedOneOf.add(repl.id);
        const candidates = permanentIds.filter(
          (candidateId) =>
            !prevented.has(candidateId) &&
            host.permanentById(candidateId) !== undefined &&
            (repl.protects?.(ctx, candidateId) ?? true),
        );
        if (candidates.length === 0) continue;
        if (repl.oncePerTurnKey !== undefined && host.oncePerTurnFired?.(repl.oncePerTurnKey)) continue;
        opts.reentryGuard.activeReplacementKeys.add(activationKey);
        let savedId: string | undefined;
        try {
          savedId = await repl.preventOneOf({ ...ctx, affectedPermanentIds: candidates }, candidates);
        } finally {
          opts.reentryGuard.activeReplacementKeys.delete(activationKey);
        }
        if (savedId === undefined) continue;
        announce(savedId);
        prevented.add(savedId);
        if (repl.oncePerTurnKey !== undefined) host.markOncePerTurnFired?.(repl.oncePerTurnKey);
        continue;
      }
      if (repl.yieldsToEarlierPrevention === true && prevented.has(leavingId)) continue;
      if (repl.affectsAll && firedAll.has(repl.id)) {
        if (protectsLeaving) prevented.add(leavingId);
        continue;
      }
      if (repl.oncePerTurnKey !== undefined && host.oncePerTurnFired?.(repl.oncePerTurnKey)) continue;
      const protectedIds = repl.affectsAll
        ? permanentIds.filter((candidateId) =>
            candidateId === leavingId
              ? protectsLeaving
              : !prevented.has(candidateId) &&
                host.permanentById(candidateId) !== undefined &&
                (repl.protects?.(ctx, candidateId) ?? true),
          )
        : [leavingId];
      const eventTargetId = protectsLeaving ? leavingId : protectedIds[0]!;
      opts.reentryGuard.activeReplacementKeys.add(activationKey);
      let did: boolean;
      let markedAtActivation = false;
      try {
        // Keep the public target visible while a nested prevention prompt is open. The
        // original target decision may belong to the opponent and is intentionally
        // private, but the permanent it selected is public game state by this point.
        const preventBody = () =>
          repl.preventCheck(
            {
              ...ctx,
              affectedPermanentIds: protectedIds,
              onActivationChosen: () => {
                if (!markedAtActivation && repl.oncePerTurnKey !== undefined) {
                  host.markOncePerTurnFired?.(repl.oncePerTurnKey);
                  markedAtActivation = true;
                }
              },
            },
            eventTargetId,
          );
        did = await ((opts.holdTriggered === true ||
          (opts.holdCardTriggered === true &&
            repl.preventionKeyword === undefined &&
            (repl.activationIdentity === undefined || !keywordReactionIdentities.has(repl.activationIdentity)))) &&
        host.resolvePreventBody !== undefined
          ? host.resolvePreventBody(preventBody)
          : preventBody());
      } finally {
        opts.reentryGuard.activeReplacementKeys.delete(activationKey);
      }
      if (!did) {
        if (repl.affectsAll) declinedAll.add(repl.id);
        continue;
      }
      if (protectsLeaving) {
        announce(leavingId);
        prevented.add(leavingId);
      }
      if (repl.affectsAll) {
        firedAll.add(repl.id);
        for (const simultaneousId of protectedIds) {
          if (host.permanentById(simultaneousId) === undefined) continue;
          // One payment saving several permanents earns one announcement each: the viewer is
          // told about every card the keyword actually kept on the board.
          if (simultaneousId !== leavingId && !prevented.has(simultaneousId)) announce(simultaneousId);
          prevented.add(simultaneousId);
        }
      }
      if (!markedAtActivation && repl.oncePerTurnKey !== undefined) {
        host.markOncePerTurnFired?.(repl.oncePerTurnKey);
      }
    }
  }
  return prevented;
}
