/* The five questions combat itself asks: block, counter, alliance, evade and barrier.

   Each is a question for this seat exactly as a `pendingDecision` is, but it answers
   through its own intent rather than the decision channel, and the server never opens
   one while a decision is unanswered — so at most one of these is ever on screen. */

import type { GameState } from "@aegis/shared";
import { instanceCardId, instancePermanentId, permCardId } from "../../decisionModel";
import { BarrierOverlay, BlockOverlay, CounterOverlay, EvadeOverlay } from "../../overlay";
import { AllianceOverlay } from "../../overlay/combat/AllianceOverlay";
import { findPermanentInState } from "../../decisionModel";
import type { CombatWindows } from "../model/combatWindows";

export function CombatWindowPrompts({
  state,
  blockWindow,
  counterWindow,
  allianceWindow,
  evadeWindow,
  barrierWindow,
  onBlock,
  onCounter,
  onAlliance,
  onEvade,
  onBarrier,
  counterSelection,
}: {
  state: GameState;
  blockWindow: CombatWindows["blockWindow"];
  counterWindow: CombatWindows["counterWindow"];
  allianceWindow: CombatWindows["allianceWindow"];
  evadeWindow: CombatWindows["evadeWindow"];
  barrierWindow: CombatWindows["barrierWindow"];
  /** No blocker means the viewer declined. */
  onBlock: (blockerPermanentId?: string) => void;
  /** No effect means the viewer passed. */
  onCounter: (instanceId?: string, effectKey?: string) => void;
  /** No ally means the viewer passed. */
  onAlliance: (allyPermanentId?: string) => void;
  onEvade: (permanentId: string, accept: boolean) => void;
  onBarrier: (permanentId: string, accept: boolean) => void;
  counterSelection?: {
    instanceId?: string;
    targetPermanentId?: string;
    onSelect: (instanceId?: string) => void;
    handInstanceIds: readonly string[];
  };
}) {
  return (
    <>
      {blockWindow ? (
        <BlockOverlay
          attackerCardId={permCardId(state, blockWindow.attackerPermanentId)}
          mustBlock={blockWindow.mustBlock}
          blockers={blockWindow.eligibleBlockerIds.flatMap((permanentId) => {
            const permanent = findPermanentInState(state, permanentId);
            return permanent
              ? [
                  {
                    permanentId,
                    cardId: permanent.topCard.cardId,
                    currentDP: permanent.currentDP,
                    sourceCount: permanent.stack.length,
                  },
                ]
              : [];
          })}
          onBlock={onBlock}
          onDecline={() => onBlock()}
        />
      ) : null}

      {counterWindow ? (
        <CounterOverlay
          eligibleCounters={counterWindow.eligibleCounters}
          selectedInstanceId={counterSelection?.instanceId}
          selectedTargetPermanentId={counterSelection?.targetPermanentId}
          onSelectInstance={counterSelection?.onSelect ?? (() => undefined)}
          handInstanceIds={counterSelection?.handInstanceIds ?? []}
          getCardId={(instanceId) => instanceCardId(state, instanceId) ?? permCardId(state, instanceId)}
          fieldPermanentOf={(instanceId) => instancePermanentId(state, instanceId)}
          onActivate={(instanceId, effectKey) => onCounter(instanceId, effectKey)}
          onPass={() => onCounter()}
          attack={{
            attackerCardId: permCardId(state, counterWindow.attackerPermanentId),
            attackerDp: findPermanentInState(state, counterWindow.attackerPermanentId)?.currentDP,
            targetCardId: counterWindow.attackTargetPermanentId
              ? permCardId(state, counterWindow.attackTargetPermanentId)
              : undefined,
          }}
        />
      ) : null}

      {allianceWindow ? (
        <AllianceOverlay
          key={`${allianceWindow.permanentId}:${allianceWindow.stateVersion ?? "current"}`}
          attackerCardId={permCardId(state, allianceWindow.permanentId)}
          allies={allianceWindow.eligibleAllyIds.flatMap((id) => {
            const permanent = findPermanentInState(state, id);
            return permanent
              ? [{ permanentId: id, cardId: permanent.topCard.cardId, currentDP: permanent.currentDP }]
              : [];
          })}
          onPass={() => onAlliance()}
        />
      ) : null}

      {evadeWindow ? (
        <EvadeOverlay
          onAccept={() => onEvade(evadeWindow.permanentId, true)}
          onDecline={() => onEvade(evadeWindow.permanentId, false)}
        />
      ) : null}

      {barrierWindow ? (
        <BarrierOverlay
          onAccept={() => onBarrier(barrierWindow.permanentId, true)}
          onDecline={() => onBarrier(barrierWindow.permanentId, false)}
        />
      ) : null}
    </>
  );
}
