import type { EffectContext } from "./effectContext.js";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import type { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";

/**
 * Extra context a binary/modal choice can carry.
 *
 * `choiceEffects` gives per-choice card provenance, when every choice is one printed
 * effect of a card. `visibleInstanceIds` / `visibleCards` name the cards the choice is
 * about, so a question such as "top or bottom of the deck?" is answered while looking at
 * the revealed cards instead of blind (P-097 Zubamon).
 */
export type ChooseOptionExtras = {
  choiceSummaries?: (DecisionEffectSummary | null)[];
  choiceEffects?: { cardId: string; timing?: string; isInherited?: boolean }[];
  /** The printed bullet of each choice; see `DecisionRequest.options.choiceClauses`. */
  choiceClauses?: string[];
  visibleInstanceIds?: string[];
  visibleCards?: { instanceId: string; cardId: string; artId?: string }[];
  /** Index into `choices` of the entry that declines an optional effect (see `DecisionRequest.options.declineIndex`). */
  declineIndex?: number;
  activation?: { index: number; total: number };
  /** See `DecisionRequest.options.topBottomZone`. */
  topBottomZone?: "digivolutionCards" | "security" | "deck";
  /** See `DecisionRequest.options.digivolveCostChoice`. */
  digivolveCostChoice?: {
    fromCardId: string;
    intoCardId: string;
    intoArtId?: string;
    costs: number[];
    costDelta: number;
  };
};

/**
 * Player-decision API (card-module contract). Each call raises a
 * DecisionRequest to the controlling seat and resolves when the matching
 * respondDecision intent arrives.
 *
 * Implemented by `createDecisionApi` in `engine/decisions/decisionApi.ts`, wired
 * into GameEngine.
 */
export interface DecisionApi extends SeatScopedDecisionApi {
  /**
   * The same decision surface, addressed to the effect's NON-controlling seat instead of
   * `ctx.source.ownerSeat` — for printed text that explicitly assigns a choice to "your
   * opponent" (e.g. "your opponent trashes 1 card in their hand"). Optional so pre-existing
   * test fixtures that build a `DecisionApi` by hand do not all need updating; card code
   * must go through `requireOpponentAsk(ctx)` (decisionApi.ts) rather than reading this
   * directly, so a fixture missing it fails loudly instead of silently no-opping. See
   * `createDecisionApi` (decisionApi.ts) for the routing/security rationale.
   */
  opponent?: SeatScopedDecisionApi;
}

/** One seat-addressed decision surface — see `DecisionApi.opponent`'s doc comment. */
export interface SeatScopedDecisionApi {
  optional(ctx: EffectContext, prompt: string): Promise<boolean>;
  chooseTargets(
    ctx: EffectContext,
    opts: {
      candidates: string[];
      min: number;
      max: number;
      visible?: string[];
      maxTotalPlayCost?: number;
      allowedTargetCombinations?: string[][];
      maxTotalDP?: number;
      promptKey?: "digivolveHost";
    },
  ): Promise<string[]>;
  selectCards(
    ctx: EffectContext,
    opts: {
      selectionGoal?: DecisionSelectionGoal;
      candidates: string[];
      min: number;
      max: number;
      visible?: string[];
      visibleCards?: { instanceId: string; cardId: string; artId?: string }[];
      maxTotalPlayCost?: number;
      differentColors?: boolean;
      distinctCardIds?: boolean;
      distinctNames?: boolean;
      assemblyCardId?: string;
      digiXrosCardId?: string;
      digiXrosMaterialLimits?: { candidateInstanceIds: string[]; max: number }[];
      /** Paid source cards that will enter trash before this DigiXros is placed. */
      digiXrosRuleTrashInstanceIds?: string[];
    },
  ): Promise<string[]>;
  /** Arrange every offered card in deck order; the first id is nearest the deck top. */
  orderCards?(
    ctx: EffectContext,
    opts: {
      candidates: string[];
      visible?: string[];
      visibleCards?: { instanceId: string; cardId: string; artId?: string }[];
      destination?: "deckTop" | "deckBottom" | "stackTop" | "stackBottom";
    },
  ): Promise<string[]>;
  selectPermanents(
    ctx: EffectContext,
    opts: { candidates: string[]; min: number; max: number; maxTotalPlayCost?: number },
  ): Promise<string[]>;
  chooseOption(ctx: EffectContext, choices: string[], extras?: ChooseOptionExtras): Promise<number>;
}
