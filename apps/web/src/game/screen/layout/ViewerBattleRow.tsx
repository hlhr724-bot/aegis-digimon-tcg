import { useTamerGrouping } from "@/design/tamerGrouping/useTamerGrouping";
import { ArenaInputRegion } from "@/game/input/ArenaInputRegion";
/* The viewer's half of the battle area.

   The whole row is a drop area: a card released anywhere in it is played. A permanent
   marks itself a candidate when the held or selected card would digivolve onto it, or
   when an armed link declaration names it. A permanent that can attack is dragged
   rather than tapped, so it keeps a keyboard path of its own. */

import type { Permanent } from "@aegis/shared";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { FieldLayout, useFieldLayout } from "../../../design/fieldLayout";
import { useTranslation } from "../../../i18n";
import { BattleRow, suspendedCardEdgeClearance } from "../../BattleRow";
import { PermanentView, type DropAttrs } from "../../piece";
import { arrangeField } from "../model/fieldArrangement";
import { OrganizedBattleRow, type OrganizedCard } from "./OrganizedBattleRow";
import { isSingledOut } from "./singledOut";
import { groupChrome } from "./groupChrome";

import type { DropTarget } from "../../dragIntents";
import type { PermanentChrome } from "../types";

export function ViewerBattleRow({
  permanents,
  chrome,
  dragIsPlay,
  selectedAttackerPermanentId,
  isBasePermanent,
  isDecisionCandidate,
  draggable,
  dropIntentAttrs,
  baseDropIntentAttrs,
  onPermanentClick,
  onPermanentPointerDown,
  onPermanentInspect,
}: {
  permanents: readonly Permanent[];
  chrome: PermanentChrome;
  /** A card is in the air over the board, which lights the row as a drop area. */
  dragIsPlay: boolean;
  selectedAttackerPermanentId: string | null;
  /** The held or selected card would digivolve onto this permanent. */
  isBasePermanent: (perm: Permanent) => boolean;
  /** This permanent's primary click answers a field decision, so inspection needs its own control. */
  isDecisionCandidate: (perm: Permanent) => boolean;
  /** This permanent answers a drag rather than a tap. */
  draggable: (perm: Permanent) => boolean;
  dropIntentAttrs: (target: DropTarget, id?: string) => DropAttrs;
  baseDropIntentAttrs: (permanentId: string) => DropAttrs;
  onPermanentClick: (perm: Permanent) => (() => void) | undefined;
  onPermanentPointerDown: (perm: Permanent, event: ReactPointerEvent) => void;
  onPermanentInspect: (perm: Permanent) => void;
}) {
  const { t } = useTranslation();
  const fieldLayout = useFieldLayout();
  const groupIdenticalTamers = useTamerGrouping();
  const isSuspended = (p: Permanent) => p.isSuspended || chrome.heldSuspendedIds.has(p.permanentId);
  const playOrder = new Map(permanents.map((permanent, index) => [permanent.permanentId, index]));
  const rowStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    gap: 26,
    justifyContent: "safe center",
    alignItems: "center",
    minHeight: 110,
    // Bottom room for the activate-effect pill, which hangs below its
    // permanent inside a row that clips vertical overflow.
    padding: "12px 18px 26px",
    borderRadius: 14,
    transition: "background 150ms, box-shadow 150ms",
    background: dragIsPlay ? "var(--ds-accent-soft)" : "transparent",
    boxShadow: dragIsPlay ? "inset 0 0 0 2px var(--ds-accent)" : "none",
  };
  const emptyLabel = (
    <span
      style={{
        fontSize: 12,
        color: dragIsPlay ? "var(--ds-accent)" : "var(--ds-text-off)",
        fontFamily: "var(--ds-font-mono)",
      }}
    >
      {dragIsPlay ? t("game.dropToPlay") : t("game.noDigimon")}
    </span>
  );

  function renderCard({ permanent: p, members, width, fieldKey, splitOff }: OrganizedCard) {
    const canDrag = draggable(p);
    return (
      <PermanentView
        key={fieldKey}
        perm={p}
        copies={members.length}
        fieldReferenceIds={members.map((member) => member.permanentId)}
        entranceKey={fieldKey}
        quietEntrance={
          splitOff ||
          chrome.combatImpactIds.has(p.permanentId) ||
          members.some((member) => chrome.heldDeletionIds?.has(member.permanentId))
        }
        heldDeletion={members.some((member) => chrome.heldDeletionIds?.has(member.permanentId))}
        keywordLabels={chrome.keywordLabels?.[p.permanentId]}
        compact={chrome.compact}
        width={width}
        refCb={(el) => {
          for (const member of members) chrome.permanentRefs.current[member.permanentId] = el;
        }}
        candidate={isBasePermanent(p)}
        picked={
          chrome.decisionPickedInstanceIds.has(p.permanentId) ||
          chrome.decisionPickedInstanceIds.has(p.topCard.instanceId)
        }
        selectionOrder={chrome.materialSelectionOrder?.get(p.permanentId)}
        {...groupChrome(members, chrome)}
        // A board-mode optional prompt points at the permanent whose
        // effect is asking, so the rail and the field read as one.
        highlight={
          selectedAttackerPermanentId === p.permanentId ||
          chrome.decisionHighlightPermanentId === p.permanentId ||
          chrome.decisionPickedInstanceIds.has(p.permanentId) ||
          chrome.decisionPickedInstanceIds.has(p.topCard.instanceId)
        }
        pending={chrome.pendingPermanentIds.has(p.permanentId)}
        fate={chrome.fateBadges.get(p.permanentId)}
        heldSuspended={chrome.heldSuspendedIds.has(p.permanentId)}
        suspendDelayMs={chrome.suspendDelayMs(playOrder.get(p.permanentId) ?? 0)}
        drop={{
          "data-drop": "perm-you",
          "data-id": p.permanentId,
          "data-field-key": fieldKey,
          "data-field-member-ids": JSON.stringify(members.map((member) => member.permanentId)),
          ...baseDropIntentAttrs(p.permanentId),
        }}
        onClick={canDrag ? undefined : onPermanentClick(p)}
        onPointerDown={canDrag ? (event) => onPermanentPointerDown(p, event) : undefined}
        // Drag-only permanents still need a pointer-free path: Enter or
        // Space selects them like a tap would.
        onKeyboardActivate={canDrag ? onPermanentClick(p) : undefined}
        onInspect={() => onPermanentInspect(p)}
        showInspect={chrome.showInspectionControls}
      />
    );
  }

  if (fieldLayout === FieldLayout.Organized) {
    const arrangement = arrangeField(permanents, {
      groupIdenticalTamers,
      isSuspended,
      isSingledOut: (p) =>
        isSingledOut(p, chrome) ||
        isBasePermanent(p) ||
        isDecisionCandidate(p) ||
        selectedAttackerPermanentId === p.permanentId,
    });
    return (
      <OrganizedBattleRow
        arrangement={arrangement}
        layoutWidth={chrome.width}
        supportFirst={false}
        digimonLabel={t("game.yourDigimonArea")}
        supportLabel={t("game.yourSupportArea")}
        emptyLabel={emptyLabel}
        renderCard={renderCard}
        isSuspended={isSuspended}
        rowProps={{
          "data-arena-region": ArenaInputRegion.VIEWER_FIELD.value,
          "data-drop": "battle-you",
          ...dropIntentAttrs("battle-you"),
          className: "game-battle-row game-battle-row--you",
          role: "group",
          "aria-label": t("game.yourBattleArea"),
          style: rowStyle,
        }}
      />
    );
  }

  return (
    <BattleRow
      data-arena-region={ArenaInputRegion.VIEWER_FIELD.value}
      data-drop="battle-you"
      {...dropIntentAttrs("battle-you")}
      className="game-battle-row game-battle-row--you"
      role="group"
      aria-label={t("game.yourBattleArea")}
      cardWidth={chrome.width}
      emptyLabel={permanents.length === 0 ? emptyLabel : null}
      edgeClearance={suspendedCardEdgeClearance(chrome.width)}
      style={rowStyle}
    >
      {permanents.map((permanent) =>
        renderCard({
          permanent,
          members: [permanent],
          width: chrome.width,
          fieldKey: permanent.permanentId,
          splitOff: false,
        }),
      )}
    </BattleRow>
  );
}
