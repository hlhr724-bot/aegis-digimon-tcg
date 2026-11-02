import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { DecisionReorderHandle } from "./DecisionReorderHandle";
import { useDecisionReorder } from "./useDecisionReorder";
import { CardFull } from "../../../design/cards";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { CardLink } from "../../cardLinks";

import { orderHintKey } from "./decisionOrderHints";
import type { DecisionCandidate } from "./decisionTypes";

/** The reorder list body for an `orderCards` decision, one row per candidate in its current slot. */
export function DecisionOrderCardsPanel({
  candidates,
  cardOrder,
  wideDialog,
  orderDestination,
  onMove,
  onReorder,
}: {
  candidates: readonly DecisionCandidate[];
  cardOrder: readonly string[];
  wideDialog: boolean;
  orderDestination: string | undefined;
  onMove: (index: number, delta: -1 | 1) => void;
  onReorder: (from: string, to: string) => void;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const drag = useDecisionReorder(onReorder);
  return (
    <div ref={drag.listRef} className="decision-overlay__order-list" style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, color: "var(--ds-text-2)", marginBottom: 10 }}>
        {t(orderHintKey(orderDestination))}
      </div>
      <div
        role="list"
        aria-label={t("overlay.chooseCardOrderPrompt")}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {cardOrder.map((instanceId, index) => {
          const card = candidates.find((candidate) => candidate.instanceId === instanceId);
          return (
            <div
              key={instanceId}
              role="listitem"
              data-reorder-id={instanceId}
              data-dragging={drag.dragging === instanceId || undefined}
              data-drop-target={(drag.dropTarget === instanceId && drag.dragging !== instanceId) || undefined}
              className="decision-overlay__order-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 8,
                borderRadius: 12,
                background: "var(--ds-fill)",
                animation: "aegis-rise 160ms ease-out",
              }}
            >
              <DecisionReorderHandle
                position={index + 1}
                onMove={(delta) => onMove(index, delta)}
                onCancel={drag.cancel}
                onRestore={(position) => {
                  const target = cardOrder[position - 1];
                  if (target) {
                    onReorder(instanceId, target);
                  }
                }}
                {...drag.handleProps(instanceId)}
              />
              <div className="decision-overlay__order-card">
                <CardFull cardId={card?.cardId ?? ""} artId={card?.artId} width={wideDialog ? 86 : 62} />
                <span className="decision-overlay__order-badge" aria-hidden="true">
                  {index + 1}
                </span>
              </div>
              <span style={{ flex: 1, fontWeight: 600 }}>
                <CardLink cardId={card?.cardId} />
              </span>
              <Button
                variant="ghost"
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
                aria-label={`${t("overlay.moveUp")}, ${card?.cardId ? getCardName(card.cardId) : t("overlay.card")}, ${index + 1}`}
              >
                <Icons.ChevronUp size={18} />
              </Button>
              <Button
                variant="ghost"
                disabled={index === cardOrder.length - 1}
                onClick={() => onMove(index, 1)}
                aria-label={`${t("overlay.moveDown")}, ${card?.cardId ? getCardName(card.cardId) : t("overlay.card")}, ${index + 1}`}
              >
                <Icons.ChevronDown size={18} />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
