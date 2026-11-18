import { useRef, useState } from "react";
import type { DecisionSelectionSlot } from "@aegis/shared/protocol/DecisionSelectionSlot";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { isValidSlotSelection } from "@aegis/shared/protocol/isValidSlotSelection";
import { DecisionCandidateGrid } from "@/game/overlay/choice/DecisionCandidateGrid";
import { DecisionChoiceCards } from "@/game/overlay/choice/DecisionChoiceCards";
import { DecisionSelectFooter } from "@/game/overlay/choice/DecisionSelectFooter";
import { scrollToNextEntry } from "@/game/overlay/choice/scrollToNextEntry";
import { TriggerChooserScrollCue } from "@/game/overlay/choice/TriggerChooserScrollCue";
import { useContentBelow } from "@/game/overlay/choice/useContentBelow";
import type { DecisionCandidate } from "@/game/overlay/choice/decisionTypes";
import { useTranslation } from "@/i18n";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";

type Props = {
  slots: readonly DecisionSelectionSlot[];
  candidates: readonly DecisionCandidate[];
  cardId: string | undefined;
  effectText: string | undefined;
  wideDialog: boolean;
  onEmphasise: (clause: string | undefined) => void;
  onRespond: (response: DecisionResponse) => void;
  onOpenBoard: () => void;
};

type PrintedClauseParams = {
  fragment: string;
  effectText: string | undefined;
};

const CLAUSE_END = /\.(\s|$)|[,;\n]| and /;
const ENDS_CLAUSE = /[.,;]$/;
const NO_BREAK_SPACE = / /g;

function searchable(text: string): string {
  return text.replace(NO_BREAK_SPACE, " ").toLowerCase();
}

function printedClause({ fragment, effectText }: PrintedClauseParams): string {
  if (effectText === undefined) {
    return fragment;
  }
  const printed = searchable(effectText);
  const start = printed.indexOf(searchable(fragment));
  if (start < 0) {
    return fragment;
  }
  const fragmentEnd = start + fragment.length;
  const end = ENDS_CLAUSE.test(fragment) ? 0 : printed.slice(fragmentEnd).search(CLAUSE_END);
  return effectText.slice(start, end < 0 ? effectText.length : fragmentEnd + end);
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function DecisionSlotSelection({
  slots,
  candidates,
  cardId,
  effectText,
  wideDialog,
  onEmphasise,
  onRespond,
  onOpenBoard,
}: Props) {
  const { t } = useTranslation();
  const translateCardText = useTranslatedCardText();
  const listRef = useRef<HTMLDivElement>(null);
  const contentBelow = useContentBelow(listRef, slots.length);
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
      <div ref={listRef} className="decision-overlay__selection decision-overlay__slots">
        {slots.map((slot, slotIndex) => {
          const slotCandidates = candidates
            .filter((candidate) => slot.candidateInstanceIds.includes(candidate.instanceId))
            .map((candidate) => ({ ...candidate, selectable: true }));
          const picks = selections[slotIndex]!;
          const translated = translateCardText({ text: slot.description, cardId });
          const clause =
            translated === slot.description ? printedClause({ fragment: slot.description, effectText }) : translated;
          return (
            <section
              key={slotIndex}
              className="decision-overlay__slot"
              aria-labelledby={`decision-slot-${slotIndex}`}
              onPointerEnter={() => onEmphasise(clause)}
              onPointerLeave={() => onEmphasise(undefined)}
              onFocus={() => onEmphasise(clause)}
              onBlur={() => onEmphasise(undefined)}
            >
              <h3 id={`decision-slot-${slotIndex}`} className="decision-overlay__slot-title">
                {capitalised(clause)}
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
        {contentBelow ? (
          <TriggerChooserScrollCue
            label={t("notice.below")}
            onClick={() => {
              if (listRef.current) {
                scrollToNextEntry(listRef.current, ".decision-overlay__slot");
              }
            }}
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
