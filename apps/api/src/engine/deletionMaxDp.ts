import type { Seat } from "@aegis/shared";

/**
 * Continuous "DP-based deletion maximum" bonuses (subsystem: static-continuous-effects).
 * a deletion effect with a printed numeric DP cap ("delete a Digimon with N DP or less")
 * may target higher-DP Digimon while these modifiers are live.
 *
 *   - owner-wide (`EffectSourceCard.Owner == card.Owner`): keyed by seat, applies to any of
 *     that seat's DP-based deletions.
 *   - self (`...PermanentOfThisCard() == card.PermanentOfThisCard()`): keyed by the source
 *     permanentId, applies only to deletions resolved by that permanent.
 *
 * Rebuilt from scratch on every continuous recompute (all producers are `EffectTiming.None`
 * statics), so it is cleared at the start of {@link GameEngine.recomputeContinuousEffects}.
 */
export class DeletionMaxDpLedger {
  private readonly ownerWide = new Map<Seat, number>();
  private readonly bySourcePermanent = new Map<string, number>();

  snapshot(): { ownerWide: [Seat, number][]; bySourcePermanent: [string, number][] } {
    return { ownerWide: [...this.ownerWide], bySourcePermanent: [...this.bySourcePermanent] };
  }

  restore(snapshot: { ownerWide: [Seat, number][]; bySourcePermanent: [string, number][] }): void {
    const owners = new Map<Seat, number>();
    const sources = new Map<string, number>();
    for (const [seat, delta] of snapshot.ownerWide) {
      if ((seat !== 0 && seat !== 1) || !Number.isFinite(delta) || owners.has(seat)) {
        throw new Error("Invalid deletion maximum owner snapshot");
      }
      owners.set(seat, delta);
    }
    for (const [id, delta] of snapshot.bySourcePermanent) {
      if (typeof id !== "string" || id.length === 0 || !Number.isFinite(delta) || sources.has(id)) {
        throw new Error("Invalid deletion maximum source snapshot");
      }
      sources.set(id, delta);
    }
    this.clear();
    for (const [seat, delta] of owners) {
      this.ownerWide.set(seat, delta);
    }
    for (const [id, delta] of sources) {
      this.bySourcePermanent.set(id, delta);
    }
  }

  addOwnerWide(seat: Seat, delta: number): void {
    this.ownerWide.set(seat, (this.ownerWide.get(seat) ?? 0) + delta);
  }

  addSelf(sourcePermanentId: string, delta: number): void {
    this.bySourcePermanent.set(sourcePermanentId, (this.bySourcePermanent.get(sourcePermanentId) ?? 0) + delta);
  }

  /** The DP-cap bonus for a deletion resolved by `seat` from `sourcePermanentId` (when known). */
  bonusFor(seat: Seat, sourcePermanentId?: string): number {
    const wide = this.ownerWide.get(seat) ?? 0;
    const self = sourcePermanentId !== undefined ? (this.bySourcePermanent.get(sourcePermanentId) ?? 0) : 0;
    return wide + self;
  }

  clear(): void {
    this.ownerWide.clear();
    this.bySourcePermanent.clear();
  }
}
