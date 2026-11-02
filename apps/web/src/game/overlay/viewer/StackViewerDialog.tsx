import { getCardDefinition } from "@aegis/shared";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { type PendingFateBadge } from "../../pendingFate";
import { type PermanentDetail } from "../../permanentDetail";
import { CardArt } from "../CardArt";
import { ROLE_LABEL_KEYS } from "../constants";
import { Scrim } from "../Scrim";
import { type StackCard } from "../types";
import { groupStackCardsByRole } from "./groupStackCardsByRole";
import { stackCardCaption } from "./stackCardCaption";
import { StackViewerState } from "./StackViewerState";

export function StackViewerDialog({
  cards,
  title,
  detail,
  fate,
  activeIndex,
  onActiveIndexChange,
  previewZoomed,
  onPreviewZoomedChange,
  canAttack,
  canVortex,
  onAttack,
  onVortex,
  onClose,
}: {
  cards: StackCard[];
  title: string;
  detail?: PermanentDetail;
  fate?: PendingFateBadge;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  previewZoomed: boolean;
  onPreviewZoomedChange: (zoomed: boolean) => void;
  canAttack: boolean;
  canVortex?: boolean;
  onAttack: () => void;
  onVortex?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const groups = groupStackCardsByRole({ cards });
  const previewCard = cards[activeIndex] ?? cards[0];
  const preview = previewCard?.cardId;
  return (
    <Scrim onClick={onClose} className="game-modal">
      <div
        className="trash-viewer-dialog game-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          gap: 22,
          maxWidth: 820,
          maxHeight: "86%",
          padding: 24,
          background: "var(--ds-sheet)",
          borderRadius: 20,
          border: "1px solid var(--ds-line)",
          boxShadow: "var(--ds-shadow-raise)",
        }}
      >
        {/* left: thumbnails grouped by role */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto",
            paddingRight: 4,
            minWidth: 200,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ds-text)", fontFamily: "var(--ds-font-display)" }}>
            {title}
          </div>
          {detail ? <StackViewerState detail={detail} fate={fate} /> : null}
          {(["top", "stack", "linked"] as const).map((role) => {
            const group = groups[role];
            if (group.length === 0) return null;
            return (
              <div key={role} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--ds-text-3)",
                  }}
                >
                  {t(ROLE_LABEL_KEYS[role])}
                </div>
                {group.map(({ card: c, index }) => {
                  const def = getCardDefinition(c.cardId);
                  const sel = activeIndex === index;
                  return (
                    <button
                      key={index}
                      onMouseEnter={() => onActiveIndexChange(index)}
                      onClick={() => onActiveIndexChange(index)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: 6,
                        borderRadius: 10,
                        cursor: "pointer",
                        textAlign: "left",
                        background: sel ? "var(--ds-accent-soft)" : "var(--ds-fill)",
                        border: `1.5px solid ${sel ? "var(--ds-accent)" : "transparent"}`,
                        transition: "background 120ms, border-color 120ms",
                      }}
                    >
                      <CardArt cardId={c.cardId} artId={c.artId} width={42} />
                      <div style={{ overflow: "hidden" }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: "var(--ds-text)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {stackCardCaption(c, t)}
                        </div>
                        <div style={{ fontFamily: "var(--ds-font-mono)", fontSize: 10.5, color: "var(--ds-text-3)" }}>
                          {def?.dp ? `${def.dp.toLocaleString()} DP` : c.cardId}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* right: large preview of the hovered card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {preview ? (
            <div
              // Touch taps emulate mouseenter without a matching leave, so only a mouse zooms.
              onPointerEnter={(event) => onPreviewZoomedChange(event.pointerType === "mouse")}
              onPointerLeave={() => onPreviewZoomedChange(false)}
              style={{
                transform: previewZoomed ? "scale(1.35)" : "scale(1)",
                transformOrigin: "center",
                transition: "transform 160ms ease",
                cursor: "zoom-in",
              }}
            >
              <CardArt cardId={preview} artId={previewCard?.artId} width={260} />
            </div>
          ) : null}
          <div className="game-actions-row" style={{ width: "100%" }}>
            {canAttack ? (
              <Button size="md" variant="danger" full icon={Icons.Swords} onClick={onAttack}>
                {t("overlay.attack")}
              </Button>
            ) : null}
            {canVortex && onVortex ? (
              <Button size="md" variant="danger" full icon={Icons.Swords} onClick={onVortex}>
                {t("overlay.vortexAttack")}
              </Button>
            ) : null}
            <Button size="md" variant="ghost" full data-arena-cancel onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </div>
    </Scrim>
  );
}
