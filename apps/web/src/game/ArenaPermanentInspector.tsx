import { CardAceBadge } from "@/design/CardAceBadge";
import { getTranslatedCardText } from "@/i18n/getTranslatedCardText";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { splitInspectorPrintedText } from "@/game/splitInspectorPrintedText";
import { InspectorActiveBadges } from "@/game/InspectorActiveBadges";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { getTranslatedCardMeta } from "@/i18n/getTranslatedCardMeta";
import { EffectText } from "./EffectText";
import { ArenaInspectorSourcesColumn } from "@/game/ArenaInspectorSourcesColumn";
import { ArenaInspectorSourcesResizer } from "@/game/ArenaInspectorSourcesResizer";
import { ArenaInspectorSourcesStrip } from "@/game/ArenaInspectorSourcesStrip";
import { useInspectorSourcesWidth } from "@/game/useInspectorSourcesWidth";
import { INSPECTOR_SIDE_SOURCES_QUERY } from "@/game/inspectorSourcesLayoutQuery";
import { useMediaQuery } from "@/design/useMediaQuery";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { CardFull } from "@/design/cards";
import { Icons } from "@/design/icons";
import { COLORS, colorKey } from "@/design/theme";
import { useTranslation } from "@/i18n/useTranslation";
import {
  groupedInspectorEvolutionCosts,
  inspectorCardsTopToBottom,
  inspectedArenaHalf,
} from "@/game/arenaInspectorModel";
import { forcedAttackGrantText } from "@/game/fieldBadges";
import type { CardInspectionDetail } from "@/game/permanentDetail";
import type { PendingFateBadge } from "@/game/pendingFate";
import { Side } from "@/game/side";
import "@/game/arenaPermanentInspector.css";

export interface ArenaInspectionOptions {
  side: Side;
  container: HTMLElement | null;
  returnFocusTo?: HTMLElement | null;
  keepsOpen?: (target: Element) => boolean;
}

/** The shared field-card detail, laid across the half opposite the selected card. */
export function ArenaPermanentInspector({
  detail,
  inspection,
  fate,
  actions,
  children,
  zoomed = false,
  onZoom,
  onClose,
}: {
  detail: CardInspectionDetail;
  inspection: ArenaInspectionOptions;
  fate?: PendingFateBadge;
  actions?: ReactNode;
  children?: ReactNode;
  zoomed?: boolean;
  onZoom: (cardId: string, artId?: string) => void;
  onClose: () => void;
}) {
  const { locale, t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const translations = useCardTranslations({ includePrintedText: true });
  const sideSources = useMediaQuery(INSPECTOR_SIDE_SOURCES_QUERY);
  const sourcesLayout = sideSources ? "column" : "strip";
  const { width: sourcesWidth } = useInspectorSourcesWidth();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const top = getCardDefinition(detail.cardId);
  const printed = splitInspectorPrintedText({
    text: getTranslatedCardText({ text: top?.effectText ?? "", translations, cardId: detail.cardId }),
  });
  const supporting = inspectorCardsTopToBottom(detail.cards).filter((card) => card.role !== "top");
  const traits = [
    ...(top?.forms ?? []).map((value) => getTranslatedCardMeta({ value, group: "forms", translations })),
    ...(top?.attributes ?? []).map((value) => getTranslatedCardMeta({ value, group: "attributes", translations })),
    ...(top?.types ?? []).map((value) => getTranslatedCardMeta({ value, group: "traits", translations })),
  ].filter((trait) => trait && trait !== "-" && trait !== "—");
  const anchor = useArenaHalfAnchor({
    container: inspection.container,
    half: inspectedArenaHalf(inspection.side),
  });

  useEffect(() => {
    const origin =
      inspection.returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    closeRef.current?.focus();
    return () => {
      if (
        origin?.isConnected &&
        (panelRef.current?.contains(document.activeElement) || document.activeElement === document.body)
      )
        origin.focus();
    };
  }, [inspection.returnFocusTo]);

  const keepsOpen = useRef(inspection.keepsOpen);
  keepsOpen.current = inspection.keepsOpen;
  useEffect(() => {
    if (zoomed) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeCallback.current();
    };
    // A keyword explanation is portalled to the page but belongs to the text inside the panel.
    const onOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".game-badge-hint")) return;
      if (target instanceof Element && keepsOpen.current?.(target)) return;
      closeCallback.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside, true);
    };
  }, [zoomed]);

  const art = (
    <button
      type="button"
      className="arena-permanent-inspector__art"
      onClick={() => onZoom(detail.cardId, detail.artId)}
      aria-label={t("overlay.zoomCard")}
    >
      <CardFull cardId={detail.cardId} artId={detail.artId} width={190} zoomOnHover={false} />
    </button>
  );

  const panel = (
    <section
      ref={panelRef}
      className="arena-permanent-inspector"
      style={{ ...anchor, "--inspector-sources-width": `${sourcesWidth}px` } as CSSProperties}
      data-half={inspectedArenaHalf(inspection.side)}
      data-card-side={inspection.side}
      data-compact={!sideSources || undefined}
      data-sources={supporting.length > 0 ? sourcesLayout : undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
    >
      <div className="arena-permanent-inspector__body">
        {supporting.length > 0 && sideSources ? (
          <>
            <ArenaInspectorSourcesResizer />
            <ArenaInspectorSourcesColumn cards={supporting} onZoom={onZoom} />
          </>
        ) : null}
        {sideSources ? art : null}
        <div className="arena-permanent-inspector__reading">
          <header className="arena-permanent-inspector__header">
            {!sideSources ? art : null}
            <div className="arena-permanent-inspector__heading">
              <div className="arena-permanent-inspector__title">
                <h2 id={titleId}>{getTranslatedCardName({ name: detail.name, translations })}</h2>
                <CardAceBadge cardId={detail.cardId} />
                {top?.level ? <span>Lv.{top.level}</span> : null}
              </div>
            </div>
            {detail.currentDP > 0 ? (
              <strong className="arena-permanent-inspector__dp">
                {detail.currentDP.toLocaleString()} DP
                {detail.dpDelta ? (
                  <em data-direction={detail.dpDelta > 0 ? "up" : "down"}>
                    {detail.dpDelta > 0 ? "+" : "−"}
                    {Math.abs(detail.dpDelta).toLocaleString()}
                  </em>
                ) : null}
              </strong>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              className="arena-permanent-inspector__close"
              data-arena-cancel
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <span aria-hidden="true">
                <Icons.X size={20} />
              </span>
            </button>
          </header>
          <div
            className="arena-permanent-inspector__state"
            role={detail.keywords.length ? "region" : undefined}
            aria-label={detail.keywords.length ? t("game.activeKeywords") : undefined}
            tabIndex={detail.keywords.length ? 0 : undefined}
          >
            {detail.suspended ? <span>{t("overlay.suspended")}</span> : null}
            <InspectorActiveBadges detail={detail} />
            {detail.dpDelta ? (
              <span>
                {t("overlay.baseDp")}: {detail.baseDP.toLocaleString()}
              </span>
            ) : null}
            {detail.transformation ? (
              <span data-warning="true">
                {t("overlay.transformedBadge", {
                  name: detail.transformation.name,
                })}
              </span>
            ) : null}
            {fate ? <span data-warning="true">{t(fate.labelKey)}</span> : null}
          </div>
          <div
            className="arena-permanent-inspector__effects"
            role="region"
            aria-label={t("overlay.printedEffect")}
            tabIndex={0}
          >
            {children}
            <details
              key={`${detail.cardId}:${detail.printedOnly}`}
              className="arena-permanent-inspector__details"
              open={detail.printedOnly || undefined}
            >
              <summary>{t("deck.cardDetails")}</summary>
              <p className="arena-permanent-inspector__meta">
                <span>{detail.cardId}</span>
                {top?.kinds.length ? (
                  <span>{top.kinds.map((kind) => t(`library.kind.${kind}`)).join(" / ")}</span>
                ) : null}
                {top?.rarity ? <span>{top.rarity}</span> : null}
              </p>
              {top?.colors.length || traits.length ? (
                <p className="arena-permanent-inspector__identity">
                  {top?.colors.map((color) => (
                    <span key={color} className="arena-permanent-inspector__color">
                      <i aria-hidden="true" style={{ background: COLORS[colorKey(color)].base }} />
                      <span>{t(`game.color.${color}`)}</span>
                    </span>
                  ))}
                  {traits.length ? <span>{traits.join(" · ")}</span> : null}
                </p>
              ) : null}{" "}
              <div className="arena-permanent-inspector__stats">
                {top && top.playCost >= 0 ? (
                  <span>{t(top.isDualCard ? "game.useCostsMemory" : "game.costsMemory", { count: top.playCost })}</span>
                ) : null}
                {groupedInspectorEvolutionCosts(top?.evoCosts ?? []).map((cost) => {
                  const colorsByLabel = new Map(cost.colors.map((color) => [t(`game.color.${color}`), color]));
                  return (
                    <span key={`${cost.level}-${cost.memoryCost}`} className="arena-permanent-inspector__evolution">
                      <span>
                        {t("overlay.digivolveCost")} {cost.memoryCost} · Lv.
                        {cost.level}
                        {" · "}
                      </span>
                      <span className="arena-permanent-inspector__colors">
                        {new Intl.ListFormat(locale, { type: "disjunction" })
                          .formatToParts([...colorsByLabel.keys()])
                          .map((part, index) =>
                            part.type === "element" ? (
                              <span
                                key={index}
                                className="arena-permanent-inspector__color"
                                data-color={colorsByLabel.get(part.value)}
                              >
                                <i
                                  aria-hidden="true"
                                  style={{
                                    background: COLORS[colorKey(colorsByLabel.get(part.value)!)].base,
                                  }}
                                />
                                <span>{part.value}</span>
                              </span>
                            ) : (
                              <span key={index}>{part.value}</span>
                            ),
                          )}
                      </span>
                    </span>
                  );
                })}
              </div>
              {printed.requirements ? (
                <p>
                  <EffectText inspector asciiBrackets text={printed.requirements} cardId={detail.cardId} allowContext />
                </p>
              ) : null}
            </details>
            {top?.effectText || supporting.length === 0 ? (
              <div className="arena-permanent-inspector__effect" data-role="top">
                <span className="arena-permanent-inspector__effect-label">{t("overlay.printedEffect")}</span>
                <p>
                  <EffectText
                    inspector
                    asciiBrackets
                    text={printed.effects || t("overlay.noPrintedEffect")}
                    cardId={detail.cardId}
                    allowContext
                  />
                </p>
              </div>
            ) : null}
            {detail.forcedAttackGrants.map((grant, index) => (
              <div
                key={`forced-attack-${index}`}
                className="arena-permanent-inspector__effect"
                data-role="granted-forced-attack"
              >
                <span className="arena-permanent-inspector__effect-label">{t("overlay.grantedEffects")}</span>
                <p>
                  <EffectText inspector asciiBrackets text={forcedAttackGrantText(grant, t, getCardName)} />
                </p>
              </div>
            ))}
            {detail.grantedEffectTexts.map((effect, index) => (
              <div key={`${effect}-${index}`} className="arena-permanent-inspector__effect" data-role="granted">
                <span className="arena-permanent-inspector__effect-label">{t("overlay.grantedEffects")}</span>
                <p>
                  <EffectText inspector asciiBrackets text={effect} cardId={detail.cardId} />
                </p>
              </div>
            ))}
            {top?.optionEffect ? (
              <div className="arena-permanent-inspector__effect" data-role="printed-option">
                <span className="arena-permanent-inspector__effect-label">
                  {t("library.optionEffect")}
                  {top.dualEffect ? ` · ${top.dualEffect}` : ""}
                </span>
                <p>
                  <EffectText inspector asciiBrackets text={top.optionEffect} cardId={detail.cardId} />
                </p>
              </div>
            ) : null}
            {detail.printedOnly
              ? [
                  {
                    role: "printed-inherited",
                    label: t("library.inheritedEffect"),
                    text: top?.inheritedEffectText,
                  },
                  {
                    role: "printed-linked",
                    label: t("overlay.role.linked"),
                    text: top?.linkEffect,
                  },
                  {
                    role: "printed-security",
                    label: t("library.securityEffect"),
                    text: top?.securityEffectText,
                  },
                ]
                  .filter((effect) => effect.text)
                  .map((effect) => (
                    <div key={effect.role} className="arena-permanent-inspector__effect" data-role={effect.role}>
                      <span className="arena-permanent-inspector__effect-label">{effect.label}</span>
                      <p>
                        <EffectText inspector asciiBrackets text={effect.text!} cardId={detail.cardId} />
                      </p>
                    </div>
                  ))
              : null}
          </div>
          {supporting.length > 0 && !sideSources ? (
            <ArenaInspectorSourcesStrip key={detail.cardId} cards={supporting} onZoom={onZoom} />
          ) : null}
          {actions ? <div className="arena-permanent-inspector__actions">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
  // Portalled to the body rather than into the board: the board clips its overflow
  // and isolates its stacking context, which would bury the detail a player just
  // opened under any dialog above the board. It is pinned back over the board's own
  // half through `anchor` instead, so it still reads as part of the arena.
  return createPortal(panel, document.body);
}

/**
 * The fixed rect covering the half of the arena opposite the inspected card.
 *
 * Without a container (tests, fixtures) it falls back to the viewport half, which is
 * what the phone layout resolves to anyway.
 */
function useArenaHalfAnchor({
  container,
  half,
}: {
  container: HTMLElement | null;
  half: "upper" | "lower";
}): CSSProperties {
  const [anchor, setAnchor] = useState<CSSProperties>({});
  useEffect(() => {
    const measure = () => {
      const rect = container?.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const boardTop = rect?.top ?? 0;
      const boardHeight = rect?.height ?? viewportHeight;
      const halfTop = half === "upper" ? boardTop : boardTop + boardHeight / 2;
      // The board can lay out wider or taller than the screen — it clips its own
      // overflow — while this panel is fixed to the viewport, so the measured half
      // is intersected with the viewport. Without it a phone paints the reading
      // column and the action row past the right edge.
      const left = Math.min(Math.max(rect?.left ?? 0, 0), viewportWidth);
      const top = Math.min(Math.max(halfTop, 0), viewportHeight);
      setAnchor({
        position: "fixed",
        left,
        width: Math.min(rect?.width ?? viewportWidth, viewportWidth - left),
        top,
        height: Math.min(boardHeight / 2 - (top - halfTop), viewportHeight - top),
        bottom: "auto",
      });
    };
    measure();
    // The board resizes without the window doing so — the hand dock grows, an
    // overlay opens, the mobile URL bar collapses — and a stale anchor leaves the
    // panel sized for the layout it was opened in.
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (container) observer?.observe(container);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [container, half]);
  return anchor;
}
