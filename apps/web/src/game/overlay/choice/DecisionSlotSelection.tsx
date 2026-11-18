import { useState } from "react";
import type { DecisionSelectionSlot } from "@aegis/shared/protocol/DecisionSelectionSlot";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { isValidSlotSelection } from "@aegis/shared/protocol/isValidSlotSelection";
import { DecisionCandidateGrid } from "@/game/overlay/choice/DecisionCandidateGrid";
import { DecisionChoiceCards } from "@/game/overlay/choice/DecisionChoiceCards";
import { DecisionSelectFooter } from "@/game/overlay/choice/DecisionSelectFooter";
import type { DecisionCandidate } from "@/game/overlay/choice/decisionTypes";
import { useTranslation } from "@/i18n";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";

type Props = {
  slots: readonly DecisionSelectionSlot[];
  candidates: readonly DecisionCandidate[];
  cardId: string | undefined;
  wideDialog: boolean;
  onRespond: (response: DecisionResponse) => void;
  onOpenBoard: () => void;
};

export function DecisionSlotSelection({ slots, candidates, cardId, wideDialog, onRespond, onOpenBoard }: Props) {
  const { t } = useTranslation();
  const translateCardText = useTranslatedCardText();
  const [selections, setSelections] = useState<string[][]>(() => slots.map(() => []));
  const togglePick = (slotIndex: number, instanceId: string) => {
    setSelections((current) =>
      current.map((picks, index) => {
        const others = picks.filter((id) => id !== instanceId);
        if (index !== slotIndex || others.length !== picks.length) {
          return others;
        }
        const max = slots[index]!.max;
        if (max === 1) {
          return [instanceId];
        }
        return picks.length < max ? [...picks, instanceId] : picks;
      }),
    );
  };
  const unassigned = candidates.filter(
    (candidate) => !slots.some((slot) => slot.candidateInstanceIds.includes(candidate.instanceId)),
  );
  return (
    <>
      <div className="decision-overlay__selection decision-overlay__slots">
        {slots.map((slot, slotIndex) => {
          const slotCandidates = candidates
            .filter((candidate) => slot.candidateInstanceIds.includes(candidate.instanceId))
            .map((candidate) => ({ ...candidate, selectable: true }));
          const picks = selections[slotIndex]!;
          return (
            <section key={slotIndex} className="decision-overlay__slot" aria-labelledby={`decision-slot-${slotIndex}`}>
              <h3 id={`decision-slot-${slotIndex}`} className="decision-overlay__slot-title">
                {translateCardText({ text: slot.description, cardId })}
              </h3>
              <DecisionCandidateGrid
                candidates={slotCandidates}
                picks={picks}
                min={slot.isMandatory ? Math.min(slot.max, slotCandidates.length) : 0}
                max={slot.max}
                selectedPlayCost={0}
                withinPlayCostBudget
                selectedDP={0}
                onTogglePick={(instanceId) => togglePick(slotIndex, instanceId)}
              />
            </section>
          );
        })}
        {unassigned.length > 0 ? (
          <DecisionChoiceCards
            candidates={unassigned}
            wideDialog={wideDialog}
            label={t("overlay.candidateZone.other")}
          />
        ) : null}
      </div>
      <DecisionSelectFooter
        canConfirm={isValidSlotSelection({ slots, selections })}
        onConfirm={() =>
          onRespond({
            kind: "selectCards",
            instanceIds: selections[0]!,
            followingSlotInstanceIds: selections.slice(1),
          })
        }
        min={1}
        onNone={() => undefined}
        onOpenBoard={onOpenBoard}
      />
    </>
  );
}
