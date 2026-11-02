import { isDeckFormat } from "@aegis/shared/deckFormat";
import type { Intent, IntentResult } from "@aegis/shared/protocol/intents";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameState } from "@aegis/shared/schema/GameState";
import {
  REPLAY_FORMAT,
  type ReplayDeck,
  type ReplayInput,
  type ReplayRecord,
  type ReplayRules,
} from "#api/replays/inputs/types";

export type MatchReplayCursor = { nextInputIndex(): number };

type Params = { seed: number; firstSeat?: Seat; state: GameState };

type IntentInput = Extract<ReplayInput, { kind: "intent" }>;

export function createMatchReplayRecorder({ seed, firstSeat, state }: Params) {
  const deckFormat = state.format;
  if (!isDeckFormat(deckFormat)) {
    throw new Error(`Bot match replay requires a known deck format: ${deckFormat}`);
  }
  const rules: ReplayRules = { deckFormat, unlimited: state.unlimited, betaBattle: false };
  const inputs: ReplayInput[] = [];
  const decks: ReplayDeck[] = [];
  let stateVersion = 0;
  let engineEvents = 0;
  let batch: { emitted: number } | undefined;
  let batchDepth = 0;

  function closeBatch() {
    const closing = batch;
    batch = undefined;
    if (closing !== undefined && closing.emitted > 0) {
      stateVersion += 1;
    }
  }

  function withBatch<T>(run: () => T): T {
    const opened = batch ?? (batch = { emitted: 0 });
    batchDepth += 1;
    try {
      return run();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0 && batch === opened) {
        closeBatch();
      }
    }
  }

  function noteEvent() {
    engineEvents += 1;
    if (batch === undefined) {
      const implicit = (batch = { emitted: 0 });
      queueMicrotask(() => {
        if (batchDepth === 0 && batch === implicit) {
          closeBatch();
        }
      });
    }
    batch.emitted += 1;
  }

  function getPlacement() {
    return { stateVersion, engineEvents };
  }

  function seatPlayer(seat: Seat, deck: ReplayDeck, run: () => void) {
    const placement = getPlacement();
    const recorded = structuredClone(deck);
    withBatch(run);
    decks[seat] = recorded;
    inputs.push({ kind: "seat", seat, deck: structuredClone(recorded), deckRules: {}, bot: true, ...placement });
  }

  function startMatch(run: () => void) {
    const placement = getPlacement();
    withBatch(run);
    inputs.push({ kind: "startMatch", ...placement });
  }

  function applyIntent(seat: Seat, intent: Intent, run: () => IntentResult): IntentResult {
    const input: IntentInput = { kind: "intent", seat, intent: structuredClone(intent), ...getPlacement() };
    inputs.push(input);
    try {
      const result = withBatch(run);
      input.ok = result.ok;
      if (!result.ok) {
        input.reason = result.reason;
      }
      return result;
    } catch (error) {
      input.threw = true;
      throw error;
    }
  }

  function buildRecord(): ReplayRecord {
    if (decks[0] === undefined || decks[1] === undefined) {
      throw new Error("Bot match replay requires both seats");
    }
    return {
      format: REPLAY_FORMAT,
      matchId: `bot-match-${seed}`,
      seed,
      ...(firstSeat === undefined ? {} : { firstSeat }),
      rules: { ...rules },
      seats: [
        { deck: structuredClone(decks[0]), bot: true },
        { deck: structuredClone(decks[1]), bot: true },
      ],
      inputs: structuredClone(inputs),
    };
  }

  const cursor: MatchReplayCursor = { nextInputIndex: () => inputs.length };

  return { noteEvent, seatPlayer, startMatch, applyIntent, buildRecord, cursor };
}
