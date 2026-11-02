type Params = { now: number; turn: number; safe: boolean };

export class RankedRoundClock {
  private readonly deadline: number;
  private overtimeTurn: number | undefined;

  constructor(startedAt: number) {
    this.deadline = startedAt + 48 * 60_000;
  }

  getDeadline(): number {
    return this.deadline;
  }

  getOvertimeTurn(): number | undefined {
    return this.overtimeTurn;
  }

  shouldDrawBeforeTurn({ now, turn }: Omit<Params, "safe">): boolean {
    this.shouldDraw({ now, turn: Math.max(0, turn - 1), safe: false });
    return this.shouldDraw({ now, turn, safe: true });
  }

  shouldDraw({ now, turn, safe }: Params): boolean {
    if (now < this.deadline) {
      return false;
    }
    this.overtimeTurn ??= turn;
    return safe && (turn > this.overtimeTurn + 3 || now >= this.deadline + 6 * 60_000);
  }
}
