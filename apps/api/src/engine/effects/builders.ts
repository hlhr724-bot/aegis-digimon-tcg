import { createScopedEffectPrimitives } from "#api/engine/effects/scopes/createScopedEffectPrimitives";
import { ScopedPrimitiveKind } from "#api/engine/effects/scopes/ScopedPrimitiveKind";
import { peekCheckedCard } from "../security/checkedCard.js";
import type { CardSource } from "./CardSource.js";
import type { Effect } from "./Effect.js";
import type { EffectContext } from "./EffectContext.js";

/**
 * Timing builders (card-module contract) — the TS mirror of the source
 * the effect factory timing classes (rule implementation, rule implementation, ...). Each
 * pre-wires canTrigger to a still-relevant guard ANDed with the card's extra
 * `when`, and sets the right flags, so a card file stays declarative.
 *
 * Card modules import these (never construct an Effect by hand).
 */
export interface BuilderOptions {
  canCancelBeforeTargets?: boolean;
  activationTextEmphasis?: string;
  source: CardSource;
  /** Original declarative trigger, when the effect came from the IR interpreter. */
  irTrigger?: string;
  effectKey: string;
  description: string;
  timingOverride?: string;
  optional?: boolean; // source `optional`
  isInherited?: boolean; // source `isInherited`
  isLinked?: boolean; // source IsLinkedEffect
  maxPerTurn?: number; // source maxCountPerTurn (1 => Once Per Turn)
  continuousPriority?: number;
  /**
   * Attack-event subject for `whenAttacking`: `self` means the Digimon carrying
   * this effect; `ally` is for observers such as Tamers whose text says "one of
   * your Digimon attacks". Defaults to the overwhelmingly common self scope.
   */
  attackScope?: "self" | "ally" | "opponent";
  when?: (ctx: EffectContext) => boolean; // EXTRA trigger condition (ANDed with the timing guard)
  canActivate?: (ctx: EffectContext) => boolean; // optional extra activation guard
  /**
   * True when a `[Trash]` tag on THIS effect's printed timing means it activates only
   * while the source sits in its owner's trash (CardEffect.isFromTrash — §15-14-3-1).
   * Consumed by the `activated` builder (the `[Main]` window, which shares its trigger
   * with every ordinary on-field/hand activated ability) to require trash residency for
   * this effect specifically and to EXCLUDE it for every other `[Main]` effect — without
   * this, extending `GameEngine.findInstance` to reach a trash-resident card would make
   * every already-shipped on-field `[Main]` ability activatable from trash too.
   */
  isFromTrash?: boolean;
  /**
   * True when a `[Hand]` tag on THIS effect's printed timing means it activates only while the
   * source sits in its owner's hand (CardEffect.isFromHand — §15-14-2-1). The trash flag's
   * mirror image, consumed by the same `activated` builder: it requires hand residency for this
   * effect specifically and EXCLUDES it for every other `[Main]` effect — `GameEngine.findInstance`
   * reaches a hand-resident card so a `[Hand][Main]` ability can be activated at all, and without
   * the exclusion that same lookup would make an ORDINARY on-field `[Main]` ability activatable
   * while its card is still in hand.
   */
  isFromHand?: boolean;
  /** True for an Option's first plain [Main] body while it resolves from use. */
  isOptionPlayBody?: boolean;
  resolve: (ctx: EffectContext) => Promise<void>; // the effect body
}

interface BuilderFlags {
  isSecurity?: boolean;
  costWindow?: "play" | "digivolve";
  /** Default guard the builder ANDs into canTrigger (the "still relevant" check). */
  baseGuard?: (ctx: EffectContext) => boolean;
}

const onField = (ctx: EffectContext): boolean => ctx.source.isOnBattleArea();
const inBreedingArea = (ctx: EffectContext): boolean => ctx.source.isOnBreedingArea?.() ?? false;
const inTrashZone = (ctx: EffectContext): boolean => ctx.source.isInTrash?.() ?? false;
const inHandZone = (ctx: EffectContext): boolean => ctx.source.isInHand?.() ?? false;
const isSecuritySource = (ctx: EffectContext): boolean =>
  peekCheckedCard(ctx.game.state, ctx.source.instanceId) !== undefined || ctx.source.isInSecurity?.() === true;

/**
 * Comprehensive Rules §3-4-5-6: "Trigger conditions can't be met by cards in breeding areas,
 * except for effects that explicitly specify or reference breeding areas." The rulebook's own
 * example is a Tamer's "[Your Turn] When your Digimon digivolves, by suspending this Tamer,
 * <Draw 1>", which stays silent when the digivolution happened in the breeding area (KB
 * Q870/Q1038; per Q4428 only the word "field" spans both areas — "your Digimon" is the battle
 * area alone).
 *
 * Board-wide windows (OnEnterFieldAnyone and friends) are broadcast with the breeding-area
 * permanent as their subject, because the effects that DO reference that area — every
 * `[Breeding]` effect, which by definition sits on the breeding permanent — must still see it.
 * So the rule is applied per OBSERVER here, in the one guard every timing builder shares: an
 * effect whose source is not itself in the breeding area cannot be triggered by a breeding-area
 * subject.
 */
const breedingSubjectHidden = (ctx: EffectContext): boolean => {
  const subjectPermanentId = ctx.trigger?.subjectPermanentId;
  if (subjectPermanentId === undefined) return false;
  if (ctx.game.permanentById(subjectPermanentId)?.inBreeding !== true) return false;
  return !inBreedingArea(ctx);
};

function build(opts: BuilderOptions, flags: BuilderFlags): Effect {
  const baseGuard = flags.baseGuard ?? onField;
  const extra = opts.when;
  const activate = opts.canActivate;
  return {
    ...(opts.irTrigger !== undefined ? { irTrigger: opts.irTrigger, activationDeferred: true } : {}),
    effectKey: opts.effectKey,
    ...(opts.canCancelBeforeTargets === true ? { canCancelBeforeTargets: true } : {}),
    description: opts.description,
    ...(opts.activationTextEmphasis === undefined ? {} : { activationTextEmphasis: opts.activationTextEmphasis }),
    ...(opts.timingOverride !== undefined ? { timingOverride: opts.timingOverride } : {}),
    optional: opts.optional ?? false,
    isInherited: opts.isInherited ?? false,
    isSecurity: flags.isSecurity ?? false,
    isLinked: opts.isLinked ?? false,
    maxPerTurn: opts.maxPerTurn ?? -1,
    ...(flags.costWindow !== undefined ? { costWindow: flags.costWindow } : {}),
    ...(opts.continuousPriority !== undefined ? { continuousPriority: opts.continuousPriority } : {}),
    canTrigger: (ctx) => !breedingSubjectHidden(ctx) && baseGuard(ctx) && (extra ? extra(ctx) : true),
    canActivate: (ctx) => (activate ? activate(ctx) : true),
    resolve: opts.resolve,
  };
}

/** "When played" / "On Play" (source rule implementation). */
export const onPlay = (opts: BuilderOptions): Effect =>
  build(opts, {
    // OnPlay itself is fired with a candidate list focused on the played instance.
    // OnEnterFieldAnyone is a board-wide companion broadcast used by observers; legacy
    // handwritten On Play modules also live there. When that broadcast supplies its subject,
    // bind the printed On Play effect to the permanent that actually entered so existing
    // permanents do not re-fire their own On Play abilities.
    baseGuard: (ctx) => {
      const subjectPermanentId = ctx.trigger.subjectPermanentId;
      return (
        onField(ctx) &&
        (subjectPermanentId === undefined || opts.source.permanent()?.permanentId === subjectPermanentId)
      );
    },
  });

/**
 * "When this card would be played" — the pay-time cost window (source BeforePayCost timing).
 * The source is still a LOOSE hand card when this fires (the play action invokes it before the
 * card leaves the hand), so there is no on-field base guard; the play action narrows the candidate
 * set to the single card being played, keeping this window scoped (EX9-043 / BT25-076).
 */
export const beforePayCost = (opts: BuilderOptions): Effect =>
  build(opts, { baseGuard: () => true, costWindow: "play" });

/** "When this card would digivolve" — the in-hand digivolution pay-time window. */
export const beforeDigivolveCost = (opts: BuilderOptions): Effect =>
  build(opts, { baseGuard: () => true, costWindow: "digivolve" });

/** "When Digivolving" (source rule implementation). */
export const whenDigivolving = (opts: BuilderOptions): Effect => build(opts, {});

/**
 * "When this Digimon attacks" (source rule implementation). Attack timing windows
 * are broadcast across the board, so the builder itself must bind the event attacker
 * to the permanent carrying the effect. Card-specific `when` predicates remain an
 * additional gate (DP, traits, etc.), never a substitute for event ownership.
 */
export const whenAttacking = (opts: BuilderOptions): Effect =>
  build(opts, {
    baseGuard: (ctx) => {
      if (!onField(ctx)) return false;
      const attackerId = ctx.trigger?.attackerPermanentId;
      // Direct card tests and legacy timing drives may omit the combat payload;
      // production combat always supplies it. Card-specific gates still apply.
      if (attackerId === undefined) return true;
      if (opts.attackScope === "ally") {
        const attacker = ctx.game.permanentById(attackerId);
        return attacker?.controllerSeat === opts.source.ownerSeat;
      }
      if (opts.attackScope === "opponent") {
        const attacker = ctx.game.permanentById(attackerId);
        return attacker?.controllerSeat !== opts.source.ownerSeat;
      }
      return ctx.source.permanent()?.permanentId === attackerId;
    },
  });

/**
 * "When deleted" (source rule implementation). Guard does not require on-field — the deleted
 * card is already loose in trash when OnDestroyedAnyone fires. When the firing window carries
 * the deleted set (`trigger.deletedInstanceIds`, set by every deletion seam), the source card
 * must be IN that set: an alive
 * permanent's — or a stale trash card's — [On Deletion] must not collect at someone else's
 * deletion window. A window without the payload (legacy/direct drives) stays permissive.
 */
export const onDeletion = (opts: BuilderOptions): Effect =>
  build(opts, {
    baseGuard: (ctx) => {
      const deleted = ctx.trigger?.deletedInstanceIds;
      if (deleted === undefined) return true;
      if (!deleted.includes(ctx.source.instanceId)) return false;
      // Inherited effects must exist at deletion, before native effects can move
      // the deleted top card into another Digimon's stack (P-239 / EX10-048).
      const deletedStack = ctx.trigger.deletedWasStackInstanceIds;
      if (opts.isInherited === true && deletedStack !== undefined && !deletedStack.includes(ctx.source.instanceId))
        return false;
      // Q6866: replaying a deleted host strands its pending effects, including those
      // inherited from cards that still remain in trash. The replay is a new Digimon.
      const deletedHost = ctx.trigger.deletedHostInstanceByInstanceId?.[ctx.source.instanceId];
      if (
        deletedHost !== undefined &&
        !ctx.game.state.players.some((player) => player.trash.some((card) => card.instanceId === deletedHost))
      ) {
        return false;
      }
      // A non-inherited effect only exists while its card is the top card of a
      // Digimon. The deletion window carries the stack-card subset captured
      // before movement, so do not collect ordinary effects from cards that
      // were merely underneath the deleted top card. The narrow exception is a
      // buried effect the deleted host had already gained through GrantStatic
      // (BT12-072 Q2214); the conferral and deletion snapshots prove that role.
      if (opts.isInherited !== true && ctx.trigger.deletedWasStackInstanceIds?.includes(ctx.source.instanceId)) {
        const conferredFromDeletedHost =
          ctx.conferredToPermanentId !== undefined &&
          ctx.trigger.deletedPermanentIds?.includes(ctx.conferredToPermanentId) === true;
        if (!conferredFromDeletedHost) return false;
      }
      if (!opts.isLinked) return true;

      const hostInstanceId = ctx.trigger.deletedLinkHostInstanceByLinkedInstanceId?.[ctx.source.instanceId];
      if (hostInstanceId === undefined) return true;
      return ctx.game.state.players.some((player) => player.trash.some((card) => card.instanceId === hostInstanceId));
    },
  });

/** "Security" effects (source rule implementation / PlaySelfTamerSecurityEffect). */
export const security = (opts: BuilderOptions): Effect => build(opts, { isSecurity: true, baseGuard: () => true });

/** Timed Security effects activate only while their source remains face up in security. */
export const securityTiming = (opts: BuilderOptions): Effect =>
  build(opts, {
    isSecurity: true,
    baseGuard: (ctx) =>
      ctx.game.state.players.some((player) =>
        player.security.some((card) => card.instanceId === ctx.source.instanceId && card.faceUp === true),
      ),
  });

/**
 * "When an effect trashes THIS card specifically from the security stack" (EffectTiming.
 * OnDiscardSecurity — not a normal security-check reveal). The card is already loose in trash
 * when this fires (mirrors `onDeletion`'s no-on-field guard), so there is no on-field base
 * guard; fired via GameEngine's fireDiscardedFromSecurity once the card lands in trash
 * (precedent: hand-written ST22-10).
 */
export const onDiscardSecurity = (opts: BuilderOptions): Effect => build(opts, { baseGuard: () => true });

/**
 * "When this Digimon is blocked" (EffectTiming.OnBlockAnyone). Fired for every block
 * regardless of who is watching (combat/controller.ts's switchDefenderToBlocker); the base
 * guard narrows to the attacker itself (`ctx.trigger.attackerPermanentId` equals this source's
 * own permanent) since the timing has no other way to distinguish attacker from blocker.
 */
export const whenBlocked = (opts: BuilderOptions): Effect =>
  build(opts, {
    baseGuard: (ctx) => {
      const attackerId = ctx.trigger?.attackerPermanentId;
      if (attackerId === undefined) return false;
      const self = ctx.source.permanent();
      return self !== undefined && self.permanentId === attackerId;
    },
  });

/**
 * "[End of Attack]" (Comprehensive Rules §15-16-15-1: triggers when the end of the attack
 * arrives "after an attack is performed using the card with that effect"). OnEndAttack is
 * broadcast board-wide by the combat controller, so — exactly like `whenAttacking` — the
 * builder binds the event attacker to the permanent carrying the effect; otherwise every
 * printed/inherited [End of Attack] on both sides would fire at the end of ANY attack,
 * including the opponent's. Direct test drives that omit the combat payload stay permissive.
 */
export const endOfAttack = (opts: BuilderOptions): Effect =>
  build(opts, {
    baseGuard: (ctx) => {
      if (!onField(ctx)) return false;
      const attackerId = ctx.trigger?.attackerPermanentId;
      if (attackerId === undefined) return true;
      return ctx.source.permanent()?.permanentId === attackerId;
    },
  });

/** start/end/your-turn windows (source rule implementation, rule implementation, ...). */
export const turnTiming = (opts: BuilderOptions): Effect => build(opts, {});

/** A [Hand][Counter] effect activates from the defending player's hand. */
export const handCounter = (opts: BuilderOptions): Effect => build(opts, { baseGuard: inHandZone });

/** "When Moving" effects trigger only for the permanent that actually moved. */
export const whenMoving = (opts: BuilderOptions): Effect =>
  build(opts, {
    baseGuard: (ctx) => {
      const movedPermanentId = ctx.trigger?.movedPermanentId;
      if (movedPermanentId === undefined) return opts.source.isOnBattleArea();
      return opts.source.permanent()?.permanentId === movedPermanentId;
    },
  });

/**
 * `{Hand}`-icon effects (source OnAddHand window; card-module contract). No
 * on-field base guard: §15-14-2-1 is that the effect activates while the card sits
 * face-up in HAND, which is never "on the battle area" — the on-field default would
 * make this window unsatisfiable for the one zone it is defined to fire from.
 */
export const onAddHand = (opts: BuilderOptions): Effect => build(opts, { baseGuard: () => true });

/**
 * `[Trash]`-tagged timed/continuous effects (§15-14-3-1: the effect activates while the
 * card sits in the trash — `CardEffect.isFromTrash` on a non-`Main` trigger, e.g.
 * `[Trash][Your Turn]`/`[Trash][All Turns]`). Routed here by `builderForTrigger` instead
 * of the on-field `staticModifier`/`turnTiming`: the base guard requires ACTUAL trash
 * residency (`ctx.source.isInTrash()`), not merely "no on-field guard" — a card that
 * later leaves the trash (played, shuffled away) must stop qualifying, exactly like
 * `breeding`'s residency guard one zone over.
 */
export const inTrash = (opts: BuilderOptions): Effect => build(opts, { baseGuard: inTrashZone });

/**
 * "When trashed from the battle area by an effect" (BT19-095; CAP-F5).
 * The card is already in trash when `WhenTrashedFromBattleArea` fires,
 * so the on-field base guard does not apply. Guard mirrors `onDeletion`:
 * the source instance must be in `trigger.deletedInstanceIds`.
 */
export const whenTrashedFromBattleArea = (opts: BuilderOptions): Effect =>
  build(opts, {
    baseGuard: (ctx) => {
      const deleted = ctx.trigger?.deletedInstanceIds;
      if (deleted === undefined) return true;
      return deleted.includes(ctx.source.instanceId);
    },
  });

/**
 * [Main] activated abilities and Option main effects (source
 * ActivateMainOptionSecurityEffect etc.). No on-field base guard: this window
 * fires for an Option being USED from hand (the card is loose, not a battle-area
 * permanent) as well as for a permanent's activated [Main] ability. The
 * caller-side guards stay authoritative — the activateEffect verb re-validates the
 * source's placement/ownership, and play-card only reaches an Option's window after
 * validating the play — so the timing builder must not additionally require the
 * source to be on the field (which would silently drop every Option main effect).
 *
 * `[Trash][Main]` (`opts.isFromTrash`, §15-14-3-1 — e.g. BT20-096, BT26-079) is the one
 * exception: it REQUIRES trash residency, and every OTHER `[Main]` effect must EXCLUDE
 * it. `GameEngine.findInstance` now also locates a trash-resident card (the eighth
 * engine gap's activation-path half) so a `[Trash][Main]` ability can be targeted at
 * all — but without this exclusion, that same lookup would make an ORDINARY on-field
 * `[Main]` ability activatable once its card has been trashed, which is not what its
 * printed text says.
 *
 * `[Hand][Main]` (`opts.isFromHand`, §15-14-2-1 — e.g. BT10-025, BT12-015, EX6-010) is the same
 * exception one zone over: the source scripts gate these on
 * `card.Owner.HandCards.Contains(card)` (documented behavior), and KB Q1828/Q2955 make the residency
 * binding ("this effect can activate during the main phase when you reveal this card from the
 * hand"). `findInstance` reaches a hand-resident card the same way it reaches a trash-resident
 * one, so the same two-sided treatment applies: require hand residency here, and EXCLUDE the hand
 * for every ordinary `[Main]` ability (whose printed text allows it only from the battle area). An
 * Option's `[Main]` body is unaffected — play-card moves the card into `resolvingOption` before
 * firing OnUseOption, so it is no longer in hand by then.
 */
export const activated = (opts: BuilderOptions): Effect =>
  build(opts, {
    baseGuard: (ctx) => {
      if (opts.isOptionPlayBody) return true;
      if (opts.isFromTrash) return inTrashZone(ctx);
      if (opts.isFromHand) return inHandZone(ctx);
      return !inTrashZone(ctx) && !inHandZone(ctx) && !inBreedingArea(ctx);
    },
  });

/**
 * Always-on continuous effects (source declarative *StaticEffect).
 *
 * `maxPerTurn` on a persistent (`EffectTiming.None`) effect is EXPLICITLY documented as
 * uncounted for the static's own re-firing (`GameEngine.recomputeContinuousEffects`: "maxPerTurn
 * is irrelevant — uncounted", since the static must re-derive every recompute, not be capped).
 * The one thing a persistent effect's `maxPerTurn` CAN mean is a `[Once Per Turn]` budget on a
 * `subscribeSubTrigger` watcher it installs (subtriggers.ts's `oncePerTurnKey`) — but that key had
 * to be threaded BY HAND on every install, so a card could set `maxPerTurn` and still install an
 * unbudgeted watcher with no key, silently uncounted exactly as before. That shape hit 3 modules
 * (BT13-008, EX4-030, BT26-079 — the latter two documenting the caveat inline) before this fix.
 *
 * When `maxPerTurn` is set (any value — some modules use `-1` as inert boilerplate on OTHER
 * statics, but every `staticModifier` in the corpus that BOTH sets `maxPerTurn` AND calls
 * `subscribeSubTrigger` is a genuine `[Once Per Turn]` watcher; verified against the full card
 * corpus, not just a sample), `resolve` sees a `ctx.fx.subscribeSubTrigger` wrapper that
 * auto-injects a stable key (`${sourceInstanceId}/${effectKey}` — stable across the
 * continuous-recompute pass that clears and reinstalls the subscription with a fresh `id` each
 * time; see subtriggers.ts's `oncePerTurnKey` doc) whenever the install omits one. A card that
 * DOES want a distinct key (or several watchers sharing one budget under a different scheme)
 * still can — the wrapper only fills in what the card left unset, never overrides an explicit
 * key. A `staticModifier` that never sets `maxPerTurn` is untouched: its `subscribeSubTrigger`
 * calls reach the real primitive directly, so an intentionally-unbudgeted `[All Turns]` watcher
 * (no printed "Once Per Turn", e.g. EX10-062, BT16-061) keeps firing without a per-turn cap.
 */
export const staticModifier = (opts: BuilderOptions): Effect => {
  const key = `${opts.effectKey}`;
  const scopedResolve: BuilderOptions["resolve"] = (ctx) => {
    const autoKey = `${ctx.source.instanceId}/${key}`;
    const scopedFx = createScopedEffectPrimitives({
      ctx,
      kind: ScopedPrimitiveKind.STATIC.value,
      autoKey,
      maxPerTurn: opts.maxPerTurn,
    });
    return opts.resolve({ ...ctx, fx: scopedFx });
  };
  return build({ ...opts, resolve: scopedResolve }, {});
};

export const digivolveCostStatic = (opts: BuilderOptions): Effect => {
  const resolve = (ctx: EffectContext) =>
    opts.resolve({ ...ctx, fx: createScopedEffectPrimitives({ ctx, kind: ScopedPrimitiveKind.EVOLUTION_COST.value }) });
  return build({ ...opts, resolve }, { baseGuard: () => true });
};

/**
 * Static modifier whose source must still be in hand. This is used by printed clauses that
 * change how the source card itself may be used before it leaves the hand (for example,
 * BT9-095's conditional Option use cost). A normal `staticModifier` is battle-area resident
 * and would therefore make such a clause inert; an unguarded static would incorrectly survive
 * after the source moved to another zone.
 */
export const handResidentStatic = (opts: BuilderOptions): Effect => build(opts, { baseGuard: inHandZone });

/**
 * Color-requirement waiver statics (source UseRequirements / "ignore this card's color
 * requirements while you have [X]" clauses — §16-42 ＜Use Req.＞ and the pre-existing
 * corpus idiom it now matches, e.g. EX2-072, BT19-093, BT7-110). Unlike `staticModifier`,
 * this carries NO on-field base guard.
 *
 * WaiveColorRequirement's ONLY supported shape is self-targeted (interpreter.ts rejects
 * any other target), so this effect always describes "waive the SAME card's own color
 * requirement" — and that requirement is checked at PLAY time (playCard.ts) or DIGIVOLVE
 * time (digivolve.ts), i.e. exactly while the card is still off the battle area (in hand,
 * or a digivolve target). Requiring on-field presence first makes the waiver permanently
 * inert for the one moment it exists to affect — the bug this builder fixes.
 * `GameEngine.recomputeContinuousEffects` already scans hand cards for `EffectTiming.None`
 * effects (`listCandidateInstances` includes `player.hand`); every prior `Static` effect
 * routed through `staticModifier`'s on-field guard regardless, so a hand-resident card's
 * own waiver never populated `continuous.hasColorWaiver`. Scope stays narrow: only
 * WaiveColorRequirement-only Static/Rule blocks route here (`isColorWaiverStatic` in
 * interpreter.ts's `builderForTrigger`) — an ordinary Static effect that ALSO does
 * something else (a keyword grant, a DP modifier, ...) keeps the on-field guard
 * untouched, so this does not let unrelated statics leak off the battle area.
 */
export const colorWaiverStatic = (opts: BuilderOptions): Effect => ({
  ...build(opts, { baseGuard: () => true }),
  isColorWaiverStatic: true,
});

/**
 * A self-scoped "cards from your trash may also be placed for this card's DigiXros" Static
 * (BT17-057 Q2811, BT18-065). Like `colorWaiverStatic`, the moment the permission is read is a
 * declaration made while the card is still off the battle area, so there is no on-field base
 * guard; the effect's own printed condition ("while you have a black Tamer") remains the gate.
 */
export const digiXrosZoneStatic = (opts: BuilderOptions): Effect => build(opts, { baseGuard: () => true });

/** Persistent effects whose source is a face-up card in the security stack. */
export const securityStatic = (opts: BuilderOptions): Effect =>
  build(
    {
      ...opts,
      resolve: (ctx) =>
        opts.resolve({
          ...ctx,
          fx: createScopedEffectPrimitives({ ctx, kind: ScopedPrimitiveKind.SECURITY.value }),
        }),
    },
    { isSecurity: true, baseGuard: isSecuritySource },
  );

/**
 * `[Breeding]`-region resident effects (source effects gated on
 * the effect runtime.IsExistOnBreedingArea, e.g. BT20_083's [Breeding][Opponent's Turn] ESS).
 * Unlike the battle-area resident builders, the base guard requires the source to be in the
 * RAISING area — a breeding-area card's resident effect fires while in breeding (and a
 * battle-area card does NOT trigger its [Breeding] effect).
 */
export const breeding = (opts: BuilderOptions): Effect => build(opts, { baseGuard: inBreedingArea });
