import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { CardZoomPreview } from "@/design/CardZoomPreview";
import { useHoverZoomEnabled } from "@/design/useHoverZoomEnabled";
import { Sigil } from "@/design/Sigil";
import { formatDp } from "@/design/formatDp";
import { useCardImageUrls } from "@/design/tokenArt/useCardImageUrls";
import { getCardDefinition, type CardColor, type CardDefinition } from "@aegis/shared";
import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_CARD_SLEEVE, DEFAULT_EGG_SLEEVE, useCardSleeve, useEggSleeve } from "./sleeve";
import { COLORS, colorKey, paletteFor, palettePairFor } from "./theme";
import { CARD_SUSPEND_MOTION } from "./cardMotion";

/** Level pips — filled dots up to level, hollow remainder (max 6). */
export function LevelPips({ level, color }: { level?: number; color: string }) {
  if (!level) return null;
  const c = COLORS[colorKey(color)];
  const dots = [];
  for (let i = 1; i <= 6; i += 1) {
    dots.push(
      <span
        key={i}
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: i <= level ? c.base : "transparent",
          border: `1px solid ${i <= level ? c.base : "rgba(120,130,150,0.4)"}`,
        }}
      />,
    );
  }
  return <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>{dots}</span>;
}

/** Card back — a faceted shield over a muted field (security / opponent cards). */
export function CardBack({
  width = 70,
  label,
  useSelectedSleeve = true,
  egg = false,
  selected = false,
}: {
  width?: number;
  label?: number | string;
  useSelectedSleeve?: boolean;
  egg?: boolean;
  selected?: boolean;
}) {
  const h = Math.round(width * 1.4);
  const selectedSleeve = useCardSleeve();
  const selectedEggSleeve = useEggSleeve();
  const sleeve = egg
    ? useSelectedSleeve
      ? selectedEggSleeve
      : DEFAULT_EGG_SLEEVE
    : useSelectedSleeve
      ? selectedSleeve
      : DEFAULT_CARD_SLEEVE;
  return (
    <div
      style={{
        width,
        height: h,
        borderRadius: Math.max(6, width * 0.07),
        background: sleeve.src ? "#0b1020" : "linear-gradient(150deg, var(--ds-fill), var(--ds-sheet))",
        border: "1px solid var(--ds-line-strong)",
        boxShadow: selected
          ? "0 0 0 2px var(--card-highlight-rim, var(--ds-rim-attention)), 0 0 18px var(--card-highlight-glow, color-mix(in srgb, var(--ds-rim-attention) 40%, transparent)), var(--ds-shadow-raise)"
          : undefined,
        transition: "box-shadow 150ms",
        display: "grid",
        placeItems: "center",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {sleeve.src ? (
        <img
          draggable={false}
          src={sleeve.src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", userSelect: "none", WebkitUserSelect: "none" }}
        />
      ) : (
        <svg
          width={width * 0.5}
          height={width * 0.5}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ds-accent)"
          strokeWidth={1.4}
          style={{ opacity: 0.85 }}
        >
          <polygon points="12 2 21.5 7 21.5 17 12 22 2.5 17 2.5 7" />
          <polygon points="12 7 17 9.5 17 14.5 12 17 7 14.5 7 9.5" fill="var(--ds-accent)" opacity="0.25" />
        </svg>
      )}
      {label != null ? (
        <span
          style={{
            position: "absolute",
            bottom: 3,
            right: 4,
            minWidth: Math.max(16, width * 0.25),
            padding: "1px 4px",
            borderRadius: 99,
            background: "rgb(8 15 30 / 82%)",
            color: "#fff",
            textAlign: "center",
            fontFamily: "var(--ds-font-mono)",
            fontSize: Math.max(9, width * 0.16),
            fontWeight: 700,
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** Full card (≈200×280 baseline; scale via `width`). For grids and detail. */
export function CardFull({
  cardId,
  artId,
  width = 200,
  selected = false,
  dim = false,
  onClick,
  count,
  zoomOnHover = true,
}: {
  cardId: string;
  artId?: string;
  width?: number;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  count?: number;
  /**
   * Show the floating preview under the pointer. Off on the match screen, where a
   * card is inspected by clicking it rather than by growing under the cursor.
   */
  zoomOnHover?: boolean;
}) {
  const translations = useCardTranslations();
  const def = getCardDefinition(cardId);
  const urls = useCardImageUrls({ cardId, artId });
  const [urlIndex, setUrlIndex] = useState(0);
  useEffect(() => setUrlIndex(0), [artId, cardId, urls]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const zoomEnabled = useHoverZoomEnabled();
  if (!def) return <CardBack width={width} label={cardId} selected={selected} />;
  const c = paletteFor(def.colors);
  const key = colorKey(def.colors[0]);
  const h = Math.round(width * 1.4);

  return (
    <div
      onClick={onClick}
      onMouseMove={zoomEnabled && zoomOnHover ? (e) => setMousePos({ x: e.clientX, y: e.clientY }) : undefined}
      onMouseLeave={zoomEnabled && zoomOnHover ? () => setMousePos(null) : undefined}
      style={{
        position: "relative",
        width,
        height: h,
        borderRadius: 10,
        // The card keeps its own colour edge when selected; the state is carried by
        // the rim and glow above it, so a selected card never gains a second border
        // in a hue the art has to argue with. A parent that owns the highlight
        // itself (the hand strip) blanks the rim through these custom properties.
        border: `2px solid ${c.edge}`,
        boxShadow: selected
          ? "0 0 0 2px var(--card-highlight-rim, var(--ds-rim-attention)), 0 0 18px var(--card-highlight-glow, color-mix(in srgb, var(--ds-rim-attention) 40%, transparent)), var(--ds-shadow-raise)"
          : "var(--ds-shadow-raise)",
        cursor: onClick ? "pointer" : "default",
        overflow: "hidden",
        opacity: dim ? 0.4 : 1,
        transition: "box-shadow 150ms, opacity 150ms",
        flexShrink: 0,
        background: `radial-gradient(${c.soft}, var(--ds-fill))`,
        display: "grid",
        placeItems: "center",
      }}
    >
      {urlIndex >= urls.length ? (
        <div
          style={{
            display: "grid",
            justifyItems: "center",
            gap: 8,
            padding: 10,
            textAlign: "center",
            color: "var(--ds-text)",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <Sigil cardId={cardId} color={key} size={Math.round(h * 0.32)} />
          <span>{getTranslatedCardName({ name: def.nameEn, translations })}</span>
          <span style={{ fontFamily: "var(--ds-font-mono)", color: "var(--ds-text-3)" }}>{cardId}</span>
        </div>
      ) : (
        <img
          draggable={false}
          src={urls[urlIndex]}
          alt={getTranslatedCardName({ name: def.nameEn, translations })}
          loading="lazy"
          decoding="async"
          onError={() => setUrlIndex((i) => i + 1)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
        />
      )}

      {count != null ? (
        <div
          style={{
            position: "absolute",
            top: -1,
            right: -1,
            background: c.base,
            color: "#0b0d14",
            fontFamily: "var(--ds-font-mono)",
            fontWeight: 600,
            fontSize: 12,
            padding: "2px 8px",
            borderRadius: "0 8px 0 8px",
          }}
        >
          ×{count}
        </div>
      ) : null}

      {zoomEnabled && zoomOnHover && mousePos ? (
        <CardZoomPreview cardId={cardId} artId={artId} x={mousePos.x} y={mousePos.y} fallbackIndex={urlIndex} />
      ) : null}
    </div>
  );
}

/**
 * Deck cover thumbnail — shows card art when a coverCardId is set, falls back
 * to the color Sigil. Mount with `key={coverCardId}` to reset on cover change.
 */
export function CoverThumb({
  coverCardId,
  artId,
  sigilColor = "Neutral",
  sigilSize = 64,
  objectPosition = "top",
}: {
  coverCardId?: string;
  artId?: string;
  sigilColor?: string;
  sigilSize?: number;
  objectPosition?: string;
}) {
  const urls = useCardImageUrls({ cardId: coverCardId, artId });
  const [urlIndex, setUrlIndex] = useState(0);
  useEffect(() => setUrlIndex(0), [artId, coverCardId, urls]);
  if (!coverCardId) return <Sigil emblem="crest" color={sigilColor} size={sigilSize} />;
  if (urlIndex >= urls.length) return <Sigil emblem="crest" color={sigilColor} size={sigilSize} />;
  return (
    <img
      draggable={false}
      src={urls[urlIndex]}
      decoding="async"
      onError={() => setUrlIndex((i) => i + 1)}
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition }}
    />
  );
}

/** Metadata scrim for a board token: play cost, level, name, DP.
 *  Rendered over the art; scales with the token width and drops the least
 *  essential fields first as space shrinks. `dp` overrides the printed value
 *  so buffs/de-buffs show the live figure. */
type TokenInfoParams = {
  def: CardDefinition;
  width: number;
  dp?: number;
  dpDelta?: number;
  renderDpDelta?: (node: ReactNode) => ReactNode;
  reference?: string;
};

function TokenInfo({ def, width, dp, dpDelta, renderDpDelta, reference }: TokenInfoParams) {
  const translations = useCardTranslations();
  const scale = width / 92;
  const px = (n: number) => Math.round(n * scale);
  const c = paletteFor(def.colors);
  const dpChip = palettePairFor(def.colors);
  const cost = def.playCost;
  const dpValue = dp ?? def.dp;
  const showLevel = def.level != null && width >= 66;

  const hasDelta = typeof dpDelta === "number" && dpDelta !== 0;
  const stacked = hasDelta || (dp !== undefined && width < 92);
  const dpBoost = "calc(1 + (var(--ds-text-scale, 1) - 1) * 2)";
  const deltaNode = hasDelta ? (
    <span
      data-dp={dpDelta < 0 ? "down" : "up"}
      style={{
        fontSize: "0.62em",
        fontWeight: 900,
        lineHeight: 1.25,
        padding: `${px(1)}px ${px(2)}px`,
        borderRadius: px(3),
        color: "var(--ds-ink)",
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 55%)",
        background:
          dpDelta < 0
            ? "color-mix(in srgb, var(--ds-danger) 40%, white)"
            : "color-mix(in srgb, var(--ds-success) 35%, white)",
      }}
    >
      {dpDelta < 0 ? "−" : "+"}
      {formatDp(Math.abs(dpDelta))}
    </span>
  ) : null;
  const dpFontSize = `calc(${px(13)}px * ${dpBoost})`;
  const hasNonRoundDp = dpValue % 1000 !== 0 || (hasDelta && dpDelta % 1000 !== 0);
  const totalCharacterWidth = formatDp(dpValue).length * 0.65;
  const deltaCharacterWidth = hasDelta ? (formatDp(Math.abs(dpDelta)).length + 1) * 0.62 * 0.65 : 0;
  const dpContentWidth = width - px(18) - 4 - (hasDelta ? px(6) : 0);
  const dpFontLimit = dpContentWidth / (totalCharacterWidth + deltaCharacterWidth);
  const dpReadout =
    dpValue > 0 ? (
      <span
        style={{
          flexShrink: 0,
          fontFamily: "var(--ds-font-mono)",
          fontSize: hasNonRoundDp ? `min(${dpFontSize}, ${dpFontLimit}px)` : dpFontSize,
          fontWeight: 800,
          color: "#fff",
          background: dpChip.split
            ? `linear-gradient(90deg, ${dpChip.from.base} 0 50%, ${dpChip.to.base} 50% 100%)`
            : "rgba(255,255,255,0.14)",
          border: `1px solid ${dpChip.split ? dpChip.to.edge : c.edge}`,
          borderRadius: px(5),
          padding: `${px(1)}px ${px(4)}px`,
          lineHeight: 1.2,
          fontVariantNumeric: "tabular-nums",
          display: "inline-flex",
          alignItems: "baseline",
          gap: px(2),
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        {formatDp(dpValue)}
        {deltaNode && (renderDpDelta ? renderDpDelta(deltaNode) : deltaNode)}
      </span>
    ) : null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {def.isDualCard ? (
        <span
          data-card-kind="dual"
          style={{
            position: "absolute",
            top: px(4),
            left: px(4),
            height: px(16),
            padding: `0 ${px(5)}px`,
            borderRadius: px(4),
            background: "rgba(11,13,20,0.9)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.4)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.45)",
            fontSize: px(8.5),
            fontWeight: 800,
            letterSpacing: "0.1em",
            lineHeight: 1,
            display: "grid",
            placeItems: "center",
          }}
        >
          DUAL
        </span>
      ) : cost >= 0 ? (
        <span
          data-cost="play"
          style={{
            position: "absolute",
            top: px(4),
            left: px(4),
            minWidth: px(20),
            height: px(20),
            padding: `0 ${px(4)}px`,
            borderRadius: px(20),
            background: `linear-gradient(150deg, ${c.base}, ${c.edge})`,
            color: c.on,
            border: "1.5px solid rgba(255,255,255,0.55)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.45)",
            fontFamily: "var(--ds-font-mono)",
            fontWeight: 700,
            fontSize: px(11),
            lineHeight: 1,
            display: "grid",
            placeItems: "center",
          }}
        >
          {cost}
        </span>
      ) : null}
      {showLevel ? (
        <span
          style={{
            position: "absolute",
            top: px(4),
            right: px(4),
            padding: `${px(1)}px ${px(5)}px`,
            borderRadius: px(6),
            background: "rgba(11,13,20,0.72)",
            color: "#fff",
            fontFamily: "var(--ds-font-mono)",
            fontSize: px(8.5),
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          Lv{def.level}
        </span>
      ) : null}
      <div
        data-dp-layout={stacked ? "stacked" : undefined}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: `${px(12)}px ${px(5)}px ${px(4)}px`,
          background: "linear-gradient(to top, rgba(8,10,16,0.92) 28%, rgba(8,10,16,0.55) 64%, transparent)",
        }}
      >
        {stacked ? <div style={{ display: "flex", justifyContent: "flex-end" }}>{dpReadout}</div> : null}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: px(3) }}>
          <span
            style={{
              color: "#fff",
              fontSize: px(9.5),
              fontWeight: 700,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
          >
            {reference ? (
              <span
                data-field-reference
                style={{
                  fontFamily: "var(--ds-font-mono)",
                  fontSize: "0.92em",
                  fontWeight: 700,
                  opacity: 0.8,
                  marginInlineEnd: px(3),
                }}
              >
                {reference}
              </span>
            ) : null}
            {getTranslatedCardName({ name: def.nameEn, translations })}
          </span>
          {!stacked ? dpReadout : null}
        </div>
      </div>
    </div>
  );
}

/** Compact board card (top of a permanent, or a hand card on the board).
 *  Pass `info` to overlay the token's name, play cost, level and DP. */
export function CardMini({
  cardId,
  artId,
  width = 88,
  suspended = false,
  suspendDelayMs = 0,
  selected = false,
  attackable = false,
  onClick,
  faceDown = false,
  info = false,
  dp,
  dpDelta,
  renderDpDelta,
  identity,
  reference,
  zoomOnHover = true,
  useSelectedSleeve = true,
}: {
  cardId?: string;
  artId?: string;
  width?: number;
  suspended?: boolean;
  /** Staggers the rotation, so an unsuspend phase sweeps the board instead of snapping. */
  suspendDelayMs?: number;
  selected?: boolean;
  attackable?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
  info?: boolean;
  dp?: number;
  dpDelta?: number;
  renderDpDelta?: (node: ReactNode) => ReactNode;
  /** Original name and colors an effect imposed (KingSukamon), shown instead of the printed ones. */
  identity?: { name: string; colors: readonly CardColor[] };
  reference?: string;
  /** Show the floating full-card preview on hover. */
  zoomOnHover?: boolean;
  useSelectedSleeve?: boolean;
}) {
  const translations = useCardTranslations();
  const printed = cardId ? getCardDefinition(cardId) : undefined;
  const def =
    printed && identity
      ? {
          ...printed,
          nameEn: identity.name || printed.nameEn,
          colors: identity.colors.length > 0 ? [...identity.colors] : printed.colors,
        }
      : printed;
  const urls = useCardImageUrls({ cardId, artId });
  const [urlIndex, setUrlIndex] = useState(0);
  useEffect(() => setUrlIndex(0), [artId, cardId, urls]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const zoomEnabled = useHoverZoomEnabled();
  if (faceDown || !def) return <CardBack width={width} selected={selected} useSelectedSleeve={useSelectedSleeve} />;
  const c = paletteFor(def.colors);
  const key = colorKey(def.colors[0]);
  const h = Math.round(width * 1.4);
  return (
    <div
      data-state={suspended ? "suspended" : "active"}
      onClick={onClick}
      onMouseMove={zoomEnabled && zoomOnHover ? (e) => setMousePos({ x: e.clientX, y: e.clientY }) : undefined}
      onMouseLeave={zoomEnabled && zoomOnHover ? () => setMousePos(null) : undefined}
      title={getTranslatedCardName({ name: def.nameEn, translations })}
      style={{
        width,
        height: h,
        borderRadius: 9,
        position: "relative",
        flexShrink: 0,
        // Same rim-and-glow grammar as the hand: the chosen permanent takes the
        // attention rim, a legal attack target the warmer threat rim, and neither
        // replaces the card's own colour edge.
        border: `1.5px solid ${c.edge}`,
        boxShadow: selected
          ? "0 0 0 2px var(--card-highlight-rim, var(--ds-rim-attention)), 0 0 16px var(--card-highlight-glow, color-mix(in srgb, var(--ds-rim-attention) 40%, transparent)), 0 6px 14px rgba(15,23,42,0.32)"
          : attackable
            ? "0 0 0 1.5px var(--ds-rim-threat), 0 0 12px color-mix(in srgb, var(--ds-rim-threat) 35%, transparent), 0 6px 14px rgba(15,23,42,0.32)"
            : "inset 0 0 0 1px rgba(255,255,255,0.06), 0 4px 10px rgba(15,23,42,0.26)",
        // The individual `rotate` property rather than `transform`, so a caller that already
        // owns the card's transform (the board's selection lift) cannot cancel the rotation.
        rotate: suspended ? "90deg" : "0deg",
        transformOrigin: "center",
        transition: `rotate ${CARD_SUSPEND_MOTION.durationMs}ms ${CARD_SUSPEND_MOTION.easing} ${suspendDelayMs}ms, box-shadow 150ms, border-color 150ms`,
        cursor: onClick ? "pointer" : "default",
        overflow: "hidden",
      }}
    >
      {urlIndex >= urls.length ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: `radial-gradient(${c.soft}, var(--ds-fill))`,
            display: "grid",
            placeItems: "center",
          }}
        >
          <Sigil cardId={def.cardId} color={key} size={width * 0.5} />
        </div>
      ) : (
        <img
          draggable={false}
          src={urls[urlIndex]}
          alt={getTranslatedCardName({ name: def.nameEn, translations })}
          decoding="async"
          onError={() => setUrlIndex((i) => i + 1)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
        />
      )}

      {info ? (
        <TokenInfo
          def={def}
          width={width}
          dp={dp}
          dpDelta={dpDelta}
          renderDpDelta={renderDpDelta}
          reference={reference}
        />
      ) : null}

      {zoomEnabled && zoomOnHover && mousePos ? (
        <CardZoomPreview cardId={def.cardId} artId={artId} x={mousePos.x} y={mousePos.y} fallbackIndex={urlIndex} />
      ) : null}
    </div>
  );
}
