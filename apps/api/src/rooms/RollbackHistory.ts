import { rollbackStateFingerprint } from "#api/rooms/rollbackStateFingerprint";
import { RollbackKind } from "@aegis/shared/protocol/RollbackKind";
import { runReplay } from "#api/replays/inputs/run";
import { REPLAY_FORMAT, type ReplayInput, type ReplayRecord } from "#api/replays/inputs/types";
import type { GameState } from "@aegis/shared/schema/GameState";

type FingerprintSource = Parameters<typeof rollbackStateFingerprint>[0];

export class RollbackHistory {
  readonly inputs: ReplayInput[] = [];
  private actions: number[] = [];
  private checkpoints = new Map<number, string>();
  private turnFingerprints = new Map<number, string>();
  private turns = new Map<number, number>();
  versionOffset = 0;

  constructor(private readonly record: Omit<ReplayRecord, "inputs" | "format" | "seats">) {}

  append(input: ReplayInput, engine?: FingerprintSource): void {
    if (input.kind === "intent" && engine) this.checkpoints.set(this.inputs.length, rollbackStateFingerprint(engine));
    this.inputs.push(structuredClone(input));
  }

  acceptAction(index: number): void {
    this.actions.push(index);
  }

  beforeTurn(turn: number, engine: FingerprintSource): void {
    this.turnFingerprints.set(turn, rollbackStateFingerprint(engine));
    this.turns.set(turn, this.inputs.length);
  }

  target(kind: RollbackKind, turn: number): { index: number; turn?: number } | undefined {
    if (kind === RollbackKind.ACTION.value) {
      const index = this.actions.at(-1);
      return index === undefined ? undefined : { index };
    }
    const start = this.turns.get(turn);
    const selected = start !== undefined && this.actions.some((index) => index >= start) ? turn : turn - 1;
    const index = this.turns.get(selected);
    return index === undefined ? undefined : { index, turn: selected };
  }

  targetSeat(target: { index: number }): number {
    let seat = -1;
    for (const index of this.actions) {
      if (index < target.index) continue;
      const input = this.inputs[index];
      if (input?.kind !== "intent") return -1;
      if (seat !== -1 && seat !== input.seat) return -1;
      seat = input.seat;
    }
    return seat;
  }

  async rebuild(target: { index: number; turn?: number }) {
    const seats = ([0, 1] as const).map((seat) => {
      const input = this.inputs.findLast((entry) => entry.kind === "seat" && entry.seat === seat);
      if (!input || input.kind !== "seat") throw new Error("Missing rollback deck");
      return { deck: input.deck, ...(input.bot ? { bot: true as const } : {}) };
    });
    const rebuilt = await runReplay(
      {
        ...this.record,
        format: REPLAY_FORMAT,
        seats: [seats[0]!, seats[1]!],
        inputs: this.inputs.slice(0, target.index),
      },
      { stopOnDivergence: true, stopBeforeTurn: target.turn },
    );
    if (
      rebuilt.divergences.length ||
      rebuilt.applied !== target.index ||
      (target.turn !== undefined && rebuilt.reachedTurn !== target.turn) ||
      rebuilt.state.gameOver ||
      rollbackStateFingerprint(rebuilt.engine) !==
        (target.turn === undefined ? this.checkpoints.get(target.index) : this.turnFingerprints.get(target.turn))
    ) {
      rebuilt.state.gameOver = true;
      rebuilt.engine.decisions.cancel();
      rebuilt.engine.combat.cancel();
      rebuilt.engine.mainPhase.abort();
      rebuilt.engine.breeding.abort();
      throw new Error("Rollback reconstruction diverged");
    }
    return rebuilt;
  }

  commit(target: { index: number; turn?: number }, state: GameState, liveVersion: number): void {
    this.inputs.length = target.index;
    this.actions = this.actions.filter((index) => index < target.index);
    for (const [turn, index] of this.turns) {
      if (index > target.index || (target.turn !== undefined && turn > target.turn)) this.turns.delete(turn);
    }
    this.versionOffset = liveVersion - state.stateVersion;
  }
}
