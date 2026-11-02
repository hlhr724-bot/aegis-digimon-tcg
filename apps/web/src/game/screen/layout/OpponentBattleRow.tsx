import { useTamerGrouping } from "@/design/tamerGrouping/useTamerGrouping";
import { ArenaInputRegion } from "@/game/input/ArenaInputRegion";
/* The opponent's half of the battle area.

   A permanent marks itself a candidate when the chosen attacker may hit it. A drag is
   always a normal declaration, so only the tap path can be in ＜Vortex＞ mode. */

import type { CSSProperties } from "react";
import type { Permanent } from "@aegis/shared";
import { FieldLayout, useFieldLayout } from "../../../design/fieldLayout";
import { useTranslation } from "../../../i18n";
import { BattleRow, suspendedCardEdgeClearance } from "../../BattleRow";
import { PermanentView, type DropAttrs } from "../../piece";
import { attackTargetIdsOf } from "../../boardModel";
import { arrangeField } from "../model/fieldArrangement";
import { OrganizedBattleRow, type OrganizedCard } from "./OrganizedBattleRow";
import { isSingledOut } from "./singledOut";
import { groupChrome } from "./groupChrome";
import type { DropTarget } from "../../dragIntents";
import type { PermanentChrome } from "../types";

export function OpponentBattleRow({
  permanents,
  chrome,
  attackerPermanent,
  draggedAttackerPermanent,
  vortexMode,
  dropIntentAttrs,
  isDecisionCandidate,
  onPermanentClick,
  onPermanentInspect,
}: {
  permanents: readonly Permanent[];
  chrome: PermanentChrome;
  /** The attacker chosen by tapping, whose targets light up. */
  attackerPermanent: Permanent | undefined;
  /** The attacker currently held in the air, whose targets light up the same way. */
  draggedAttackerPermanent: Permanent | undefined;
  vortexMode: boolean;
  dropIntentAttrs: (target: DropTarget, id?: string) => DropAttrs;
  isDecisionCandidate: (perm: Permanent) => boolean;
  onPermanentClick: (perm: Permanent) => (() => void) | undefined;
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
  };
  const emptyLabel = (
    <span style={{ fontSize: 12, color: "var(--ds-text-off)", fontFamily: "var(--ds-font-mono)" }}>
      {t("game.noDigimon")}
    </span>
  );
  const isCandidate = (p: Permanent) =>
    isDecisionCandidate(p) ||
    attackTargetIdsOf(attackerPermanent, vortexMode).includes(p.permanentId) ||
    attackTargetIdsOf(draggedAttackerPermanent, false).includes(p.permanentId);

  function renderCard({ permanent: p, members, width, fieldKey, splitOff }: OrganizedCard) {
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
        drop={{
          "data-drop": "perm-opp",
          "data-id": p.permanentId,
          "data-field-key": fieldKey,
          "data-field-member-ids": JSON.stringify(members.map((member) => member.permanentId)),
          ...dropIntentAttrs("perm-opp", p.permanentId),
        }}
        candidate={isCandidate(p)}
        picked={
          chrome.decisionPickedInstanceIds.has(p.permanentId) ||
          chrome.decisionPickedInstanceIds.has(p.topCard.instanceId)
        }
        {...groupChrome(members, chrome)}
        highlight={
          chrome.decisionHighlightPermanentId === p.permanentId ||
          chrome.decisionPickedInstanceIds.has(p.permanentId) ||
          chrome.decisionPickedInstanceIds.has(p.topCard.instanceId)
        }
        pending={chrome.pendingPermanentIds.has(p.permanentId)}
        fate={chrome.fateBadges.get(p.permanentId)}
        heldSuspended={chrome.heldSuspendedIds.has(p.permanentId)}
        suspendDelayMs={chrome.suspendDelayMs(playOrder.get(p.permanentId) ?? 0)}
        onClick={onPermanentClick(p)}
        onInspect={() => onPermanentInspect(p)}
        showInspect={chrome.showInspectionControls}
        useSelectedSleeve={false}
      />
    );
  }

  if (fieldLayout === FieldLayout.Organized) {
    const arrangement = arrangeField(permanents, {
      groupIdenticalTamers,
      isSuspended,
      isSingledOut: (p) => isSingledOut(p, chrome) || isCandidate(p),
    });
    return (
      <OrganizedBattleRow
        arrangement={arrangement}
        layoutWidth={chrome.width}
        supportFirst
        digimonLabel={t("game.oppDigimonArea")}
        supportLabel={t("game.oppSupportArea")}
        emptyLabel={emptyLabel}
        renderCard={renderCard}
        isSuspended={isSuspended}
        rowProps={{
          "data-arena-region": ArenaInputRegion.OPPONENT_FIELD.value,
          className: "game-battle-row game-battle-row--opp",
          role: "group",
          "aria-label": t("game.oppBattleArea"),
          style: rowStyle,
        }}
      />
    );
  }

  return (
    <BattleRow
      data-arena-region={ArenaInputRegion.OPPONENT_FIELD.value}
      className="game-battle-row game-battle-row--opp"
      role="group"
      aria-label={t("game.oppBattleArea")}
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
