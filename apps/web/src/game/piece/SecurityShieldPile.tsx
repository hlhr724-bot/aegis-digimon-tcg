import { useState, type CSSProperties } from "react";
import type { SecurityCardView } from "@aegis/shared";
import { CardBurst } from "../CardBurst";
import { SecurityCardSlot } from "../SecurityCardSlot";
import type { Side } from "../side";
import { buildShieldShards } from "./shieldShards";
import type { DropAttrs } from "./types";

export function SecurityShieldPile({
  count,
  label,
  className,
  dim,
  glow,
  selected,
  shield,
  armed,
  breaking,
  shardSeed,
  securityDpDelta = 0,
  faceUp,
  securityCards,
  useSelectedSleeve = true,
  attackLabel,
  landing,
  refEl,
  onClick,
  onInspect,
  drop,
}: {
  count: number;
  label: string;
  className?: string;
  dim?: boolean;
  glow?: boolean;
  selected?: boolean;
  /** Red for the viewer, blue for the opponent. */
  shield: Side;
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
  /** Hidden cards wear the viewer's chosen sleeve, like their deck; the opponent's wear the default back. */
  useSelectedSleeve?: boolean;
  /** What attacking this stack would be, while it is a legal target being aimed at. */
  attackLabel?: string;
  /** A card is flying back onto the stack. */
  landing?: number;
  refEl?: (el: HTMLDivElement | null) => void;
  onClick?: () => void;
  onInspect?: () => void;
  drop?: DropAttrs;
}) {
  const [reactionKey, setReactionKey] = useState(landing);
  if (landing !== undefined && landing !== reactionKey) setReactionKey(landing);
  const dpLabel =
    securityDpDelta !== 0 ? `${securityDpDelta > 0 ? "+" : "−"}${Math.abs(securityDpDelta)} DP` : undefined;
  const pane = (
    <div
      key={reactionKey ?? "rest"}
      data-security-landing-key={landing}
      className={[
        "game-security-shield",
        `game-security-shield--${shield}`,
        glow ? "game-security-shield--glow" : "",
        selected ? "game-security-shield--selected" : "",
        armed ? "game-security-shield--armed" : "",
        landing ? "game-security-shield--landing" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={refEl}
      onClick={onClick}
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
      aria-pressed={onClick ? selected : undefined}
      aria-label={`${label} · ${count}${dpLabel ? ` · ${dpLabel}` : ""}`}
      {...(drop ?? {})}
      style={{ cursor: onClick ? "pointer" : "default", opacity: dim ? 0.5 : 1 }}
    >
      {breaking ? (
        <span className="game-security-shield__burst" aria-hidden>
          <CardBurst variant="shatter" />
        </span>
      ) : null}
      {breaking ? (
        <span className="game-security-shield__shards" aria-hidden>
          {buildShieldShards(shardSeed ?? 0).map((shard, index) => (
            <i
              key={index}
              style={
                {
                  "--shard-x": `${shard.x}px`,
                  "--shard-y": `${shard.y}px`,
                  "--shard-spin": `${shard.spin}deg`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      ) : null}
      {faceUp ? (
        <span className="game-security-shield__face-up" aria-hidden>
          ◉
        </span>
      ) : null}
      {/* Re-keyed on the value so the pop restarts every time security moves. */}
      <span key={count} className="game-security-shield__count" aria-hidden>
        {count}
      </span>
      <span className="game-security-cards">
        {/* Index 0 is checked first, so it paints above later/bottom slots. */}
        {Array.from({ length: Math.min(count, 10) }, (_, index) => (
          <SecurityCardSlot
            key={securityCards?.[index]?.instanceId || `security-${index}`}
            cardId={securityCards?.[index]?.faceUp ? securityCards[index].cardId : ""}
            artId={securityCards?.[index]?.faceUp ? securityCards[index].artId : undefined}
            faceUp={securityCards?.[index]?.faceUp === true}
            stackDepth={Math.min(count, 10) - index}
            useSelectedSleeve={useSelectedSleeve}
          />
        ))}
      </span>
      <span className="game-security-shield__label" aria-hidden>
        {label}
      </span>
    </div>
  );
  // The shield is clipped to its own polygon, so the label has to sit outside it.
  if (!attackLabel && !dpLabel) return pane;
  return (
    <span className="game-security-shield-wrap">
      {pane}
      {dpLabel ? (
        <span className="game-security-shield__dp-label" aria-hidden>
          {dpLabel}
        </span>
      ) : null}
      {attackLabel ? (
        <span className="game-security-shield__attack-label" aria-hidden>
          {attackLabel}
        </span>
      ) : null}
    </span>
  );
}
