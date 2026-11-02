import type { Keyword } from "@aegis/shared";
import type { EffectContext } from "./EffectContext.js";
import type { Permanent } from "@aegis/shared";
import type { ActivationMemoryCost } from "#api/engine/effects/ActivationMemoryCost";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";

/**
 * TS analogue of the source `ICardEffect`. Card files almost never
 * construct this by hand; they use the timing builders in builders.ts, which set
 * the right flags (card-module contract).
 */
export interface Effect {
  activationMemoryCost?: ActivationMemoryCost;
  decisionSummary?: DecisionEffectSummary;
  /** Original declarative trigger, retained for selective stack-effect conferrals. */
  irTrigger?: string;
  /** The compiled body reports acceptance through EffectContext.onActivationChosen. */
  activationDeferred?: boolean;
  canCancelBeforeTargets?: boolean;
  activationTextEmphasis?: string;
  isActivatedConsequence?: boolean;
  /** Semantic keyword implemented by this whole effect, retained for selective copying. */
  keywordEffect?: Keyword;
  /** Stable id within the card (analogue of HashString); e.g. "BT7-089/pierce". */
  effectKey: string;
  /** Rules text shown in the log / decision prompt. */
  description: string;
  /** Optional printed timing label used when the engine routes a trigger through a shared window. */
  timingOverride?: string;
  /**
   * Still pending, but its body can do nothing right now (a cost-free "you may" with no legal
   * target), so it is never offered. Lets the resolver tell the log that it had no effect.
   */
  lacksLegalOutcome?: () => boolean;
  /** Must the controller be asked? (source IsOptional) */
  optional: boolean;
  /** Granted via the digivolution stack? (source IsInheritedEffect) */
  isInherited: boolean;
  /** Triggered from security? (source IsSecurityEffect) */
  isSecurity: boolean;
  /** From the Link mechanic? (source IsLinkedEffect) */
  isLinked: boolean;
  /** -1 = unlimited (source MaxCountPerTurn). */
  maxPerTurn: number;
  /** Self-only payment effect of the card being played or digivolved; absent for resident watchers. */
  costWindow?: "play" | "digivolve";
  /** True when this pay-time effect is itself a play-cost reducer. */
  isPlayCostReduction?: boolean;
  /** Own use requirement; may be evaluated for an Option stored under another card. */
  isColorWaiverStatic?: boolean;
  /**
   * Ordering tier inside a continuous recomputation. Effects that read a keyword
   * granted by another continuous effect run after ordinary providers, so their
   * result cannot depend on physical stack order.
   */
  continuousPriority?: number;

  canTrigger(ctx: EffectContext): boolean;
  canActivate(ctx: EffectContext): boolean;
  /**
   * False when this resolution can process nothing (＜Raid＞ with no unsuspended target). The
   * effect still resolves in its place, but no trigger/resolve announcement reaches players.
   */
  announce?(): boolean;
  /** Read-only reduction projection for a prospective paid play. */
  potentialPlayCostReduction?(ctx: EffectContext, target?: Permanent): number;
  /** False proves this isolated reducer has no payment target; true leaves final cost unknown. */
  canAttemptPlayCostReduction?(ctx: EffectContext): boolean;
  /** The Activate(...) body; await player decisions here. */
  resolve(ctx: EffectContext): Promise<void>;
}
