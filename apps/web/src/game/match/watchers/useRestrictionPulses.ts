import { useLayoutEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { GameState } from "@aegis/shared";
import type { AnimationQueue, AnimationStep } from "@/game/animationQueue";
import { freezePulses as diffFreezePulses, type FreezeFlags, type FreezePulse } from "../../freezePulse";
import { TIMINGS } from "../../timings";
import { CONSEQUENCE_GATE_MAX_MS, waitForGate, type PresentationGate } from "../presentationGate";
import type { StateSnapshot } from "@/net/presentedState";
import { readStatusFlags } from "./readStatusFlags";

/**
 * A permanent that just had "can't attack" / "can't block" imposed on it jolts.
 *
 * The driver is the server's own projection of those restrictions, so nothing here reads card
 * text; a permanent that entered already restricted is not a moment, which is what the
 * baseline read keeps out.
 *
 * The jolt on the card and the badge under it already say the Digimon lost the action, and
 * the effect's own clause is on screen beside them, so there is no notice. Several permanents
 * can be locked by one resolution, so each jolts on its own track.
 */
export function useRestrictionPulses({
  state,
  queue,
  restrictionsByPermanentRef,
  freezePulseKeyRef,
  causingEffectGateRef,
  setFreezePulses,
  snapshots,
  contextOfRevision,
}: {
  state: GameState | undefined;
  queue: AnimationQueue;
  /** Mutated: last read of every permanent's restrictions, so the next commit can diff it. */
  restrictionsByPermanentRef: MutableRefObject<Map<string, FreezeFlags> | null>;
  freezePulseKeyRef: MutableRefObject<number>;
  /** The clause that imposed the lock, which is read out before the card jolts. */
  causingEffectGateRef: MutableRefObject<PresentationGate | null>;
  setFreezePulses: Dispatch<SetStateAction<ReadonlyMap<string, FreezePulse>>>;
  snapshots?: readonly StateSnapshot[];
  contextOfRevision?: (stateVersion: number) => { gate: PresentationGate | null; origin?: AnimationStep["origin"] };
}) {
  const lastStateVersionRef = useRef<number | undefined>(undefined);
  const restrictionSignature = state
    ? [...state.players]
        .flatMap((player) => [...player.battleArea, ...(player.breeding ? [player.breeding] : [])])
        .map((permanent) => {
          const flags = readStatusFlags(permanent);
          return `${permanent.permanentId}:${flags.cannotAttack ? 1 : 0}${flags.cannotBlock ? 1 : 0}:${flags.debuffs}:${flags.buffs}`;
        })
        .join(",")
    : "";
  useLayoutEffect(() => {
    if (!state) {
      lastStateVersionRef.current = undefined;
      restrictionsByPermanentRef.current = null;
      return;
    }
    const lastVersion = lastStateVersionRef.current;
    if (lastVersion !== undefined && state.stateVersion < lastVersion) {
      restrictionsByPermanentRef.current = null;
    }
    if (contextOfRevision && restrictionsByPermanentRef.current && lastVersion !== undefined) {
      for (const snapshot of snapshots ?? []) {
        if (snapshot.stateVersion > lastVersion && snapshot.stateVersion <= state.stateVersion) {
          observe(snapshot.state);
        }
      }
    }
    observe(state);
    lastStateVersionRef.current = state.stateVersion;

    function observe(read: GameState) {
      const current = new Map<string, FreezeFlags>();
      for (const player of read.players) {
        for (const permanent of player.battleArea) {
          current.set(permanent.permanentId, readStatusFlags(permanent));
        }
      }
      const previous = restrictionsByPermanentRef.current;
      restrictionsByPermanentRef.current = current;
      if (!previous || queue.getMode() !== "live") return;
      const pulses = diffFreezePulses({ previous, next: current, nextKey: freezePulseKeyRef.current });
      if (pulses.length === 0) return;
      freezePulseKeyRef.current += pulses.length;
      const revisionContext = contextOfRevision?.(read.stateVersion);
      const causingEffectGate = revisionContext ? revisionContext.gate : causingEffectGateRef.current;
      for (const pulse of pulses) {
        queue.enqueue({
          id: `freeze-pulse-${pulse.key}`,
          ...(revisionContext?.origin ? { origin: revisionContext.origin } : {}),
          track: `freezePulse-${pulse.permanentId}`,
          replace: contextOfRevision === undefined,
          async run(context) {
            if (context.mode !== "live") return;
            await waitForGate(causingEffectGate, context, CONSEQUENCE_GATE_MAX_MS, "restrictionPulse/causingEffect");
            if (context.cancelled) return;
            try {
              setFreezePulses((pulsing) => new Map(pulsing).set(pulse.permanentId, pulse));
              await context.wait(
                pulse.kind === "buff" || pulse.kind === "debuff" ? TIMINGS.statusPulse : TIMINGS.freezeShake,
              );
            } finally {
              setFreezePulses((pulsing) => {
                if (pulsing.get(pulse.permanentId)?.key !== pulse.key) return pulsing;
                const next = new Map(pulsing);
                next.delete(pulse.permanentId);
                return next;
              });
            }
          },
        });
      }
    }
  }, [restrictionSignature, state?.stateVersion, snapshots]);
}
