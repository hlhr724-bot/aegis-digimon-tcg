import { CardKind, getCardDefinition, type Permanent } from "@aegis/shared";
import { CardBurst } from "../CardBurst";
import type { PermanentBurst } from "../showcases";
import { useTranslation } from "../../i18n";
import type { DropAttrs } from "./types";
import { PermanentView } from "./PermanentView";
import { useBreedingTransferOrigin } from "../breedingTransfer";

export function BreedingSlot({
  perm,
  keywordLabels,
  label,
  candidate,
  focused,
  compact,
  burst,
  effectSource,
  effectLinked,
  highlight,
  width,
  onClick,
  onInspect,
  suggested,
  drop,
}: {
  perm?: Permanent;
  keywordLabels?: Readonly<Record<string, string>>;
  label: string;
  candidate?: boolean;
  /** The breeding step is open: the slot is the one lit thing on a dimmed board. */
  focused?: boolean;
  compact?: boolean;
  /**
   * The burst the slot is playing: a hatch opens white into blue behind a dark
   * vignette, an evolution in breeding takes the same centre-lit treatment.
   */
  burst?: PermanentBurst;
  /** The raised Digimon's effect is activating or being read, as on the battle rows. */
  effectSource?: boolean;
  effectLinked?: boolean;
  /** A board-mode prompt points at the raised Digimon whose effect is asking. */
  highlight?: boolean;
  /** Explicit slot width; overrides the `compact` default. */
  width?: number;
  onClick?: () => void;
  onInspect?: () => void;
  suggested?: boolean;
  drop?: DropAttrs;
}) {
  const { t } = useTranslation();
  const transferOrigin = useBreedingTransferOrigin(perm?.permanentId);
  const w = width ?? (compact ? 66 : 100);
  return (
    <div
      className={`game-breeding-slot${burst ? " game-breeding-slot--lit" : ""}${focused ? " game-breeding-slot--focus" : ""}`}
      data-burst={burst?.variant}
      data-permanent-id={perm?.permanentId}
      data-card-id={perm?.topCard?.cardId}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 2 : 5 }}
    >
      <div
        data-arena-suggested={(suggested && !!onClick) || undefined}
        data-inspectable={!!onInspect || undefined}
        onContextMenu={
          onInspect
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onInspect();
              }
            : undefined
        }
        onClick={onClick}
        onKeyDown={
          onClick
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onClick();
              }
            : undefined
        }
        className="game-breeding-slot__box"
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? label : undefined}
        {...(drop ?? {})}
        style={{
          position: "relative",
          width: w,
          height: Math.round(w * 1.4),
          borderRadius: compact ? 8 : 12,
          border: candidate ? "2px solid var(--ds-warning)" : "1.5px dashed var(--ds-line-strong)",
          display: "grid",
          placeItems: "center",
          background: "var(--ds-fill)",
          cursor: onClick ? "pointer" : "default",
          animation: candidate ? "aegis-pulse 1.2s ease-in-out infinite" : "none",
        }}
      >
        {burst && burst.variant !== "evolve" ? (
          <span className="game-breeding-slot__burst" aria-hidden="true">
            <CardBurst key={burst.key} cueKey={burst.key} variant={burst.variant} color={burst.color} landing />
          </span>
        ) : null}
        {perm && perm.topCard?.cardId ? (
          <PermanentView
            perm={perm}
            refCb={transferOrigin}
            // An egg uses its accepted hatch cue rather than the ordinary field fade.
            // Keep this quiet after the burst ends so clearing it cannot replay an entrance.
            quietEntrance={getCardDefinition(perm.topCard.cardId)?.kinds.includes(CardKind.DigiEgg)}
            burst={burst?.variant === "evolve" ? burst : undefined}
            keywordLabels={keywordLabels}
            compact={compact}
            width={w}
            effectSource={effectSource}
            effectLinked={effectLinked}
            highlight={highlight}
            onInspect={onInspect}
            showInspect={focused}
          />
        ) : (
          <span
            style={{
              fontSize: compact ? 8 : 10,
              color: "var(--ds-text-off)",
              fontFamily: "var(--ds-font-mono)",
            }}
          >
            {t("game.emptySlot")}
          </span>
        )}
      </div>
      <span
        style={{
          fontFamily: "var(--ds-font-mono)",
          fontSize: compact ? 8 : 10,
          letterSpacing: "0.05em",
          color: "var(--ds-text-3)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}
