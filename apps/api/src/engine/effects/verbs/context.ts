import {
  CardKind,
  Permanent,
  EffectDuration,
  CardInstance,
  type CardDefinition,
  type PreventionKeyword,
  type PlayerState,
  type Seat,
  type ZoneRef,
} from "@aegis/shared";
import { GameStateAccess } from "../../state/access.js";
import { ContinuousEffectLedger } from "../continuous.js";
import { SubTriggerRegistry } from "../subtriggers.js";
import type { Primitives } from "../EffectContext.js";

import type { PrimitivesEngine } from "./types.js";
import { createSharedHelpers } from "./helpers.js";

/**
 * Two verbs take an argument the published contract deliberately leaves out, for
 * callers inside this folder only. The modules reach each other through `fx`, so
 * `fx` has to be the wider implementation type or those calls stop compiling.
 */
export interface InternalVerbs {
  draw: (
    seat: Seat,
    n: number,
    opts?: { excludeInstanceIds?: readonly string[]; drawReason?: "digivolution" },
  ) => Promise<CardInstance[]>;
  relocatePermanent: (
    destPermanentId: string,
    sourcePermanentId: string,
    opts?: { belowTop?: boolean; shedOwnCards?: boolean; faceUp?: boolean },
    emitMovementEvents?: boolean,
  ) => boolean;
}

/**
 * Everything the verb modules share: the authoritative state and the ledgers, the
 * small readers over them, and two late-bound slots.
 *
 * `fx` is the assembled verb set, `helpers` the shared non-verb logic. Both are
 * filled in before any verb can run, which is what lets the modules call each
 * other: they were one closure before this split, and every name in it was in
 * scope for every other.
 */
export type PrimitivesContext = ReturnType<typeof createContextState> & {
  fx: Primitives & InternalVerbs;
  helpers: ReturnType<typeof createSharedHelpers>;
};

function createContextState(engine: PrimitivesEngine) {
  const state = engine.state;
  const access = new GameStateAccess(state, engine.memory, (event) => engine.emit(event));
  const ledger = engine.modifiers;
  const continuous = engine.continuous ?? new ContinuousEffectLedger();
  const decoyCostPermanentIds = engine.decoyCostPermanentIds ?? new Set<string>();
  const subTriggers = engine.subTriggers ?? new SubTriggerRegistry();
  const effectSeatStack: Seat[] = [];
  const effectSourceKindsStack: string[][] = [];
  const effectSourcePermanentIdStack: (string | undefined)[] = [];
  const effectTargetsEmittedStack: Set<string>[] = [];
  /**
   * Tell the client that a keyword paid to prevent `saved`'s deletion. These keywords resolve
   * through a plain decision and then a silent board change, so without this the viewer sees
   * only the cost card leaving and a deletion that quietly did not happen. The battle path has
   * its own copy of these keywords (combat/controller.ts) and emits the same event.
   */
  const emitDeletionPrevented = (
    keyword: PreventionKeyword,
    saved: Permanent,
    paidPermanentId?: string,
    paidCardId?: string,
  ): void => {
    engine.emit({
      kind: "deletionPrevented",
      keyword,
      seat: saved.controllerSeat,
      permanentId: saved.permanentId,
      ...(saved.topCard === undefined ? {} : { cardId: saved.topCard.cardId }),
      ...(paidPermanentId === undefined ? {} : { paidPermanentId }),
      ...(paidCardId === undefined ? {} : { paidCardId }),
    });
  };
  const currentHandAddProvenance = () => {
    const ownerSeat = effectSeatStack.at(-1);
    if (ownerSeat === undefined) return undefined;
    return {
      ownerSeat,
      isDigimonEffect: (effectSourceKindsStack.at(-1) ?? []).includes(CardKind.Digimon),
    };
  };
  const digiXrosZoneExpansions = new Map<
    Seat,
    Array<{
      zones: ZoneRef[];
      duration: EffectDuration;
      activationTurnCount: number;
      activationTurnSeat: Seat;
      perPlay?: boolean;
      pendingPlayInstanceId?: string;
      materialLimits?: Partial<Record<ZoneRef, number>>;
    }>
  >();
  const digiXrosExpansionIsActive = (
    entry: {
      duration: EffectDuration;
      activationTurnCount: number;
      activationTurnSeat: Seat;
    },
    seat: Seat,
  ): boolean => {
    if (entry.duration === EffectDuration.Permanent) return true;
    const currentTurn = state.turnCount;
    const currentTurnSeat = state.turnSeat;
    if (entry.duration === EffectDuration.UntilEachTurnEnd) {
      return currentTurn <= entry.activationTurnCount;
    }
    if (entry.duration === EffectDuration.UntilOwnerTurnEnd) {
      const ownerTurn = entry.activationTurnSeat === seat;
      const targetTurnCount = ownerTurn ? entry.activationTurnCount : entry.activationTurnCount + 1;
      return currentTurn <= targetTurnCount;
    }
    if (entry.duration === EffectDuration.UntilOpponentTurnEnd) {
      const opponentTurn = entry.activationTurnSeat !== seat;
      const targetTurnCount = opponentTurn ? entry.activationTurnCount : entry.activationTurnCount + 1;
      return currentTurn <= targetTurnCount;
    }
    // DigiXros expanders are normally turn-scoped/permanent. Treat an unsupported
    // finite marker conservatively as active for the activation turn only rather
    // than leaking it across a turn boundary.
    return currentTurn === entry.activationTurnCount || currentTurnSeat === entry.activationTurnSeat;
  };
  const activeDigiXrosExpansions = (seat: Seat) => {
    const entries = digiXrosZoneExpansions.get(seat) ?? [];
    const active = entries.filter((entry) => digiXrosExpansionIsActive(entry, seat));
    if (active.length !== entries.length) {
      if (active.length === 0) digiXrosZoneExpansions.delete(seat);
      else digiXrosZoneExpansions.set(seat, active);
    }
    return active;
  };
  const addDigiXrosExpansion = (
    seat: Seat,
    zones: ZoneRef[],
    duration: EffectDuration,
    perPlay = false,
    pendingPlayInstanceId?: string,
    materialLimits?: Partial<Record<ZoneRef, number>>,
  ): void => {
    const entries = digiXrosZoneExpansions.get(seat) ?? [];
    entries.push({
      zones: [...new Set(zones)],
      ...(materialLimits === undefined ? {} : { materialLimits: { ...materialLimits } }),
      duration,
      activationTurnCount: state.turnCount,
      activationTurnSeat: state.turnSeat,
      perPlay,
      ...(pendingPlayInstanceId === undefined ? {} : { pendingPlayInstanceId }),
    });
    digiXrosZoneExpansions.set(seat, entries);
  };
  const player = (seat: Seat): PlayerState => access.player(seat);

  // Breeding/hatch effect verbs (the Digi-Egg-deck seam): hatch a Digi-Egg into the empty
  // breeding slot, or place the top of the Digi-Egg deck under a permanent as a digivolution
  // card. Kept in breeding.ts so the Digi-Egg-deck zone logic stays co-located.
  const dropPermanentLedgers = (permanentId: string): void => {
    ledger.dropPermanent(permanentId);
    continuous.dropPermanent(permanentId);
    subTriggers.dropPermanent(permanentId);
  };

  /**
   * A stack peeled by an effect is checked as the position it came from, not as a newly played
   * card. Option and other non-field tops are invalid, and an ordinary no-DP Digi-Egg is invalid
   * as well (BT26-060 Q7082/Q7083); a DP-bearing Digi-Egg (Mother D-Reaper, for example) remains
   * a legal promoted top. A Tamer top stays in play as a Tamer (BT5-094 Q1372, BT17-011 Q2729).
   */
  const promotedTopNeedsInvalidRuleTrash = (definition: CardDefinition): boolean => {
    const isDigimon = definition.kinds.includes(CardKind.Digimon);
    const isTamer = definition.kinds.includes(CardKind.Tamer);
    const isDigiEgg = definition.kinds.includes(CardKind.DigiEgg);
    return !isDigimon && !isTamer && (!isDigiEgg || (definition.dp ?? 0) <= 0);
  };

  /** Whether the engine is currently re-firing persistent effects (see PrimitivesEngine). */
  const continuousPass = (): boolean => engine.inContinuousPass?.() ?? false;
  /** `{ continuous: true }` while re-firing persistent effects, else undefined. */
  const continuousOpt = (): { continuous: boolean } | undefined =>
    continuousPass() ? { continuous: true } : undefined;

  /**
   * Modifier ledgers frame owner/opponent durations from the affected permanent's seat.
   * Printed durations are framed from the resolving effect's controller, so swap the two
   * relative boundaries when an effect grants a modifier to an opponent's permanent.
   */
  const durationForTarget = (permanentId: string, duration: EffectDuration): EffectDuration => {
    if (duration !== EffectDuration.UntilOwnerTurnEnd && duration !== EffectDuration.UntilOpponentTurnEnd) {
      return duration;
    }
    const targetSeat = access.permanentById(permanentId)?.controllerSeat;
    const resolvingSeat = effectSeatStack.at(-1) ?? engine.controllerSeat();
    if (targetSeat === undefined || targetSeat === resolvingSeat) return duration;
    return duration === EffectDuration.UntilOwnerTurnEnd
      ? EffectDuration.UntilOpponentTurnEnd
      : EffectDuration.UntilOwnerTurnEnd;
  };

  return {
    sequences: { delayedMemorySequence: 0, stripSequence: 0 },
    customGrants: new Map<string, { grant: Record<string, unknown>; duration: EffectDuration }[]>(),
    engine,
    state,
    access,
    ledger,
    continuous,
    decoyCostPermanentIds,
    subTriggers,
    effectSeatStack,
    effectSourceKindsStack,
    effectSourcePermanentIdStack,
    effectTargetsEmittedStack,
    emitDeletionPrevented,
    currentHandAddProvenance,
    digiXrosZoneExpansions,
    digiXrosExpansionIsActive,
    activeDigiXrosExpansions,
    addDigiXrosExpansion,
    player,
    dropPermanentLedgers,
    promotedTopNeedsInvalidRuleTrash,
    continuousPass,
    continuousOpt,
    durationForTarget,
  };
}

/** The shared context, with both late-bound slots filled. */
export function createPrimitivesContext(engine: PrimitivesEngine): PrimitivesContext {
  const pc: PrimitivesContext = {
    ...createContextState(engine),
    fx: undefined as unknown as Primitives & InternalVerbs,
    helpers: undefined as unknown as ReturnType<typeof createSharedHelpers>,
  };
  pc.helpers = createSharedHelpers(pc);
  return pc;
}
