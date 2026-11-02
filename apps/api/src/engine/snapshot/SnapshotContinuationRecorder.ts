import type { GameEngine } from "#api/engine/GameEngine";
import type { GameEngineSnapshot } from "#api/engine/snapshot/GameEngineSnapshot";
import type { SnapshotContinuationInput } from "#api/engine/snapshot/SnapshotContinuationInput";
import { snapshotSettledGameEngine } from "#api/engine/snapshot/snapshotSettledGameEngine";

type PendingInput = SnapshotContinuationInput extends infer Input
  ? Input extends SnapshotContinuationInput
    ? Omit<Input, "events">
    : never
  : never;

const MAX_CONTINUATION_INPUTS = 64;

type RecordParams = { engine: GameEngine; input: PendingInput };

export class SnapshotContinuationRecorder {
  #enabled = false;
  #anchor: GameEngineSnapshot | undefined;
  #inputs: SnapshotContinuationInput[] = [];
  #events = 0;

  get isEnabled(): boolean {
    return this.#enabled;
  }

  enable(): void {
    this.#enabled = true;
  }

  noteEvent(): void {
    if (this.#anchor !== undefined) {
      this.#events++;
    }
  }

  recordInput({ engine, input }: RecordParams): void {
    if (!this.#enabled || !engine.runtimeObjects.snapshotsEnabled) {
      return;
    }
    const anchor = findSettledSnapshot(engine);
    if (anchor !== undefined) {
      this.#anchor = anchor;
      this.#inputs = [];
      this.#events = 0;
    }
    if (this.#anchor === undefined) {
      return;
    }
    if (this.#inputs.length >= MAX_CONTINUATION_INPUTS) {
      this.#anchor = undefined;
      this.#inputs = [];
      this.#events = 0;
      return;
    }
    this.#inputs.push({ ...structuredClone(input), events: this.#events } as SnapshotContinuationInput);
  }

  getContinuationSnapshot(): GameEngineSnapshot | undefined {
    if (this.#anchor === undefined) {
      return undefined;
    }
    return { ...this.#anchor, continuation: { inputs: [...this.#inputs], events: this.#events } };
  }
}

function findSettledSnapshot(engine: GameEngine): GameEngineSnapshot | undefined {
  try {
    return snapshotSettledGameEngine({ engine });
  } catch {
    return undefined;
  }
}
