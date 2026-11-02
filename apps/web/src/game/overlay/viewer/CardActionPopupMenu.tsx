import { useRef } from "react";
import { useArenaInputCancel } from "@/game/input/useArenaInputCancel";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import { createPortal } from "react-dom";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import type { CardActionEffect, CardActionLink } from "./cardActionMenuTypes";

const item: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px",
  border: "none",
  background: "transparent",
  color: "var(--ds-text)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
  whiteSpace: "nowrap",
};

/** Menu anchored to the card, for mouse layouts. */
export function CardActionPopupMenu({
  x,
  y,
  onClose,
  canAttack,
  canVortex,
  onViewStack,
  onAttack,
  onVortex,
  link,
  effects,
  cardId,
}: {
  x: number;
  y: number;
  onClose: () => void;
  canAttack: boolean;
  canVortex?: boolean;
  onViewStack: () => void;
  onAttack: () => void;
  onVortex?: () => void;
  link?: CardActionLink;
  effects?: CardActionEffect[];
  cardId?: string;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  useArenaInputCancel({ ref: menuRef, onCancel: onClose });
  const translateCardText = useTranslatedCardText();
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000 }} />
      <div
        className="card-inspector-dialog"
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("game.actions")}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: x,
          top: y,
          transform: "translate(-50%, calc(-100% - 10px))",
          zIndex: 9001,
          minWidth: 150,
          background: "var(--ds-sheet)",
          border: "1px solid var(--ds-line-strong)",
          borderRadius: 12,
          boxShadow: "0 16px 40px rgba(15,23,42,0.4)",
          padding: 5,
          display: "flex",
          flexDirection: "column",
          animation: "aegis-pop 120ms ease-out",
        }}
      >
        <button autoFocus style={item} onClick={onViewStack} {...hoverBackground("var(--ds-fill)")}>
          <Icons.Search size={15} /> {t("overlay.viewStack")}
        </button>
        {canAttack ? (
          <button
            style={{ ...item, color: "var(--ds-danger)" }}
            onClick={onAttack}
            {...hoverBackground("var(--ds-danger-soft)")}
          >
            <Icons.Swords size={15} /> {t("overlay.attack")}
          </button>
        ) : null}
        {canVortex && onVortex ? (
          <button
            style={{ ...item, color: "var(--ds-danger)" }}
            onClick={onVortex}
            {...hoverBackground("var(--ds-danger-soft)")}
          >
            <Icons.Swords size={15} /> {t("overlay.vortexAttack")}
          </button>
        ) : null}
        {link ? (
          <button style={item} onClick={link.onLink} {...hoverBackground("var(--ds-fill)")}>
            <Icons.Link2 size={15} /> {t("overlay.link")}
          </button>
        ) : null}
        {(effects ?? []).map((effect) => (
          <button
            key={effect.label}
            style={item}
            onClick={effect.onActivate}
            title={translateCardText({ text: effect.label, cardId })}
            aria-label={`${t("game.activateEffect")}: ${translateCardText({ text: effect.label, cardId })}`}
            {...hoverBackground("var(--ds-fill)")}
          >
            <span aria-hidden="true">⚡</span> {t("game.activateMainEffect")}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

// Touch taps emulate mouseenter without a matching leave, so only a mouse highlights.
function hoverBackground(color: string) {
  return {
    onPointerEnter: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse") event.currentTarget.style.background = color;
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.currentTarget.style.background = "transparent";
    },
  };
}
