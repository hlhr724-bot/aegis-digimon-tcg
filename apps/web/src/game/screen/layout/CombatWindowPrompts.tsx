/* The five questions combat itself asks: block, counter, alliance, evade and barrier.

   Each is a question for this seat exactly as a `pendingDecision` is, but it answers
   through its own intent rather than the decision channel, and the server never opens
   one while a decision is unanswered — so at most one of these is ever on screen. */

import type { GameState } from "@aegis/shared";
import { BoardBlockPrompt } from "../../BoardDecisionRail";
import { instanceCardId, instancePermanentId, permCardId } from "../../decisionModel";
import { BarrierOverlay, BlockOverlay, CounterOverlay, EvadeOverlay } from "../../overlay";
import { AllianceOverlay } from "../../overlay/combat/AllianceOverlay";
import { findPermanentInState } from "../../decisionModel";
import { AffectedDigimonList } from "@/game/overlay/choice/AffectedDigimonList";
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
  const battleAreaPermanents = Array.from(state.players).flatMap((player) => Array.from(player.battleArea));
  return (
    <>
      {blockWindow ? (
        blockWindow.eligibleBlockerIds.length ? (
          <BoardBlockPrompt
            attackerCardId={permCardId(state, blockWindow.attackerPermanentId)}
            mustBlock={blockWindow.mustBlock}
            onDecline={() => onBlock()}
          />
        ) : (
          <BlockOverlay
            attackerCardId={permCardId(state, blockWindow.attackerPermanentId)}
            mustBlock={blockWindow.mustBlock}
            blockers={[]}
            onBlock={onBlock}
            onDecline={() => onBlock()}
          />
        )
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
          permanentId={evadeWindow.permanentId}
          affected={<AffectedDigimonList permanentIds={[evadeWindow.permanentId]} permanents={battleAreaPermanents} />}
          onAccept={() => onEvade(evadeWindow.permanentId, true)}
          onDecline={() => onEvade(evadeWindow.permanentId, false)}
        />
      ) : null}

      {barrierWindow ? (
        <BarrierOverlay
          permanentId={barrierWindow.permanentId}
          affected={
            <AffectedDigimonList permanentIds={[barrierWindow.permanentId]} permanents={battleAreaPermanents} />
          }
          onAccept={() => onBarrier(barrierWindow.permanentId, true)}
          onDecline={() => onBarrier(barrierWindow.permanentId, false)}
        />
      ) : null}
    </>
  );
}
