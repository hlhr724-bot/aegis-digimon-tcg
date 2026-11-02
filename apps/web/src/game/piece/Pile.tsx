import type { CSSProperties } from "react";
import type { SecurityCardView } from "@aegis/shared";
import { CardBack, CardMini } from "../../design/cards";
import { deckLayerCount } from "../deckChrome";
import type { Side } from "../side";
import { SecurityShieldPile } from "./SecurityShieldPile";
import type { DropAttrs } from "./types";
import type { TrashEffectCard } from "../effectSource";
import { TrashSourceCard } from "./TrashSourceCard";
import { motionPreference } from "@/design/motion/motionPreference";

export function Pile({
  count,
  label,
  className,
  topCardId,
  topArtId,
  effectCard,
  dim,
  glow,
  selected,
  compact,
  shield,
  armed,
  breaking,
  shardSeed,
  securityDpDelta = 0,
  faceUp,
  securityCards,
  attackLabel,
  riffling,
  landing,
  refEl,
  onClick,
  onInspect,
  drop,
  useSelectedSleeve = true,
  egg = false,
  width,
}: {
  count: number;
  label: string;
  className?: string;
  topCardId?: string;
  topArtId?: string;
  /** The physical card activating from this pile, independently of its top card. */
  effectCard?: TrashEffectCard;
  dim?: boolean;
  glow?: boolean;
  selected?: boolean;
  compact?: boolean;
  /** Render as a shield-shaped security counter (red for the viewer, blue for the opponent). */
  shield?: Side;
  /** The stack is under attack: the pane pulses before it breaks. */
  armed?: boolean;
  /** The pane is shattering on a security check. */
  breaking?: boolean;
  /** Which break this is, so its shards are thrown differently from the last one's. */
  shardSeed?: number;
  /** The stack holds a card the opponent has already seen. */
  securityDpDelta?: number;
  faceUp?: boolean;
  securityCards?: ArrayLike<SecurityCardView>;
  /** What attacking this stack would be, while it is a legal target being aimed at. */
  attackLabel?: string;
  /** Accepted occurrence key, or true for a static gallery specimen. */
  riffling?: boolean | number;
  /** A card is flying back onto the stack. */
  landing?: number;
  refEl?: (el: HTMLDivElement | null) => void;
  onClick?: () => void;
  onInspect?: () => void;
  drop?: DropAttrs;
  useSelectedSleeve?: boolean;
  egg?: boolean;
  width?: number;
}) {
  const w = width ?? (compact ? 42 : 62);
  const reducedMotion = motionPreference.useReduced();
  const shuffleMotion = riffling && !reducedMotion;
  if (shield) {
    return (
      <SecurityShieldPile
        count={count}
        label={label}
        className={className}
        dim={dim}
        glow={glow}
        selected={selected}
        shield={shield}
        armed={armed}
        breaking={breaking}
        shardSeed={shardSeed}
        securityDpDelta={securityDpDelta}
        faceUp={faceUp}
        securityCards={securityCards}
        useSelectedSleeve={useSelectedSleeve}
        attackLabel={attackLabel}
        landing={landing}
        refEl={refEl}
        onClick={onClick}
        onInspect={onInspect}
        drop={drop}
      />
    );
  }
  const layers = deckLayerCount(count);
  return (
    <div
      className={className}
      ref={refEl}
      onClick={onClick}
      data-arena-suggested={(glow && !!onClick) || undefined}
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
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onClick();
            }
          : undefined
      }
      role={onClick ? "button" : "img"}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${label} · ${count}`}
      {...(drop ?? {})}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: compact ? 2 : 5,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {/* The pile is as thick as it is deep, and gone entirely once it empties —
          the reference client's own deck-out warning. */}
      <div
        aria-hidden
        data-deck-riffle-key={typeof riffling === "number" ? riffling : undefined}
        className={`game-pile${effectCard ? " game-pile--has-effect-card" : ""}${egg ? " game-pile--egg" : ""}${shuffleMotion ? " game-pile--riffling" : ""}`}
        style={{ position: "relative", width: w, height: w * 1.4 }}
      >
        {Array.from({ length: layers }, (_, index) => (
          <div
            key={`${riffling}:${index}`}
            className="game-pile__layer"
            style={{
              position: "absolute",
              inset: 0,
              transform: `translate(${(index + 1) * 1.2}px,${(index + 1) * 1.2}px)`,
              borderRadius: 8,
              background: "var(--ds-fill)",
              border: "1px solid var(--ds-line)",
            }}
          >
            {shuffleMotion ? <CardBack width={w} useSelectedSleeve={useSelectedSleeve} egg={egg} /> : null}
          </div>
        ))}
        {shuffleMotion && layers > 0 ? (
          <div
            key={String(riffling)}
            className="game-pile__shuffle-face"
            style={{ "--deck-riffle-sign": layers % 2 === 0 ? 1 : -1 } as CSSProperties}
          >
            <CardBack width={w} useSelectedSleeve={useSelectedSleeve} egg={egg} />
          </div>
        ) : null}
        {layers === 0 ? null : (
          <div
            className="game-pile__top"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 8,
              overflow: "hidden",
              boxShadow: glow ? "0 0 0 3px var(--ds-warning), 0 0 18px rgba(217,154,43,0.55)" : "none",
              transition: "box-shadow 200ms",
              opacity: dim ? 0.5 : 1,
            }}
          >
            {topCardId ? (
              <CardMini cardId={topCardId} artId={topArtId} width={w} zoomOnHover={false} />
            ) : (
              <CardBack width={w} label={count} useSelectedSleeve={useSelectedSleeve} egg={egg} />
            )}
          </div>
        )}
        {effectCard ? <TrashSourceCard key={effectCard.key} card={effectCard} width={w} /> : null}
        {topCardId && layers > 0 ? (
          <span
            className="game-pile__count"
            style={{
              position: "absolute",
              zIndex: 3,
              bottom: -2,
              right: -2,
              background: "var(--ds-text)",
              color: "var(--ds-paper)",
              fontFamily: "var(--ds-font-mono)",
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 5px",
              borderRadius: 6,
            }}
          >
            {count}
          </span>
        ) : null}
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
