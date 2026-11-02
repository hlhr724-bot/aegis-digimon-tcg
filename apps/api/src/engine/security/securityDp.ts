import type { SecurityDpSnapshot } from "#api/engine/security/SecurityDpSnapshot";
import { EffectDuration, type Seat } from "@aegis/shared";

interface TriggeredSecurityDpModifier {
  seat: Seat;
  delta: number;
  duration: EffectDuration;
}

/** Continuous and turn-scoped DP modifiers applied during a security check battle. */
export class SecurityDpLedger {
  private readonly continuousBySeat = new Map<Seat, number>();
  private triggered: TriggeredSecurityDpModifier[] = [];

  constructor(private readonly onChange?: (seat: Seat, delta: number) => void) {}

  snapshot(): SecurityDpSnapshot {
    return {
      continuous: Array.from(this.continuousBySeat, ([seat, delta]) => [seat, delta] as const),
      triggered: this.triggered.map((entry) => ({ ...entry })),
    };
  }

  restore(snapshot: SecurityDpSnapshot): void {
    const continuous = new Map<Seat, number>();
    for (const [seat, delta] of snapshot.continuous) {
      if ((seat !== 0 && seat !== 1) || !Number.isFinite(delta) || continuous.has(seat)) {
        throw new Error("Invalid continuous security DP snapshot");
      }
      continuous.set(seat, delta);
    }
    const triggered = snapshot.triggered.map((entry) => {
      if (
        (entry.seat !== 0 && entry.seat !== 1) ||
        !Number.isFinite(entry.delta) ||
        !Number.isInteger(entry.duration) ||
        !Object.values(EffectDuration).includes(entry.duration)
      ) {
        throw new Error("Invalid triggered security DP snapshot");
      }
      return { ...entry };
    });
    this.continuousBySeat.clear();
    for (const [seat, delta] of continuous) {
      this.continuousBySeat.set(seat, delta);
    }
    this.triggered = triggered;
    this.publish();
  }

  private publish(): void {
    this.onChange?.(0, this.deltaFor(0));
    this.onChange?.(1, this.deltaFor(1));
  }

  add(seat: Seat, delta: number, opts?: { continuous?: boolean; duration?: EffectDuration }): void {
    if (opts?.continuous === true) {
      this.continuousBySeat.set(seat, (this.continuousBySeat.get(seat) ?? 0) + delta);
      this.publish();
      return;
    }
    this.triggered.push({ seat, delta, duration: opts?.duration ?? EffectDuration.UntilEachTurnEnd });
    this.publish();
  }

  deltaFor(seat: Seat): number {
    return (
      (this.continuousBySeat.get(seat) ?? 0) +
      this.triggered.filter((modifier) => modifier.seat === seat).reduce((total, modifier) => total + modifier.delta, 0)
    );
  }

  deltaForCard(seat: Seat, isDigimon: boolean): number {
    return isDigimon ? this.deltaFor(seat) : 0;
  }

  clearContinuous(): void {
    this.continuousBySeat.clear();
    this.publish();
  }

  sweepTurnEnd(turnSeat: Seat): void {
    this.triggered = this.triggered.filter((modifier) => {
      if (modifier.duration === EffectDuration.Permanent) return true;
      if (modifier.duration === EffectDuration.UntilOwnerTurnEnd) return modifier.seat !== turnSeat;
      if (modifier.duration === EffectDuration.UntilOpponentTurnEnd) return modifier.seat === turnSeat;
      return false;
    });
    this.publish();
  }
}
