export interface DecisionEffectSummary {
  readonly memoryGain: number;
  readonly cardsDrawn: number;
  readonly cardsRecovered: number;
  readonly cardsReturnedFromTrash: number;
  readonly removal: number;
  readonly plays: number;
  readonly evolutions: number;
  readonly unsuspends: number;
  readonly memoryCost: { readonly minimum: number; readonly maximum: number | null };
  readonly uncertain: boolean;
}
