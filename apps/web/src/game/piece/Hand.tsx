import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { Fragment, useLayoutEffect, useState, type HTMLAttributes } from "react";
import { CardFull } from "../../design/cards";
import { Icons } from "../../design/icons";
import { TOUCH_LAYOUT_QUERY, useMediaQuery } from "../../design/useMediaQuery";
import { useTranslation } from "../../i18n";
import { useEnterAnimation } from "../animations";
import { HAND_CARD_WIDTH } from "./constants";
import { computeHandCardLayout } from "./handCardLayout";
import { buildHandCopyLabels } from "./handCopyLabels";
import {
  HAND_FAN_ROOM,
  HAND_MIN_EXPOSURE,
  HAND_TILT_BLEED,
  HAND_TOUCH_GAP,
  handOverlap,
  handRowHeight,
} from "./handLayout";
import { HandScrollCue } from "./HandScrollCue";
import type { HandEntry, HandSelection } from "./types";
import { useElementWidth } from "./useElementWidth";
import { useHandPickGesture } from "./useHandPickGesture";
import { useScrollOverflow } from "./useScrollOverflow";
import { HandSourceFocus } from "./HandSourceFocus";
import { HandHoverFace } from "./HandHoverFace";
import { useHandArrivalArt } from "./useHandArrivalArt";
import type { EffectActivation } from "../effectSource";
import { motionPreference } from "@/design/motion/motionPreference";
import type { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";
import { getEffectSourceMarkLabelKey } from "@/game/effectMarks/getEffectSourceMarkLabelKey";

export function Hand({
  cards,
  selectedInstanceId,
  startDrag,
  selectCard,
  draggingInstanceId,
  selection,
  shakeInstanceId,
  effectSourceInstanceId,
  effectSource,
  effectSourceMarks,
  onHoverChange,
  cardWidth = HAND_CARD_WIDTH,
  minExposure = HAND_MIN_EXPOSURE,
  onMoveCard,
  reorderDropBeforeInstanceId,
}: {
  cards: HandEntry[];
  onMoveCard?: (instanceId: string, direction: -1 | 1) => void;
  reorderDropBeforeInstanceId?: string | null;
  selectedInstanceId?: string;
  startDrag: (index: number, e: React.PointerEvent, origin?: HTMLElement) => void;
  selectCard?: (index: number) => void;
  draggingInstanceId?: string;
  selection?: HandSelection;
  /** The card a refused action was sent from: it shakes where it sits. */
  shakeInstanceId?: string;
  /** An Option activating out of the hand: it rises out of the fan with an orange outline. */
  effectSourceInstanceId?: string;
  effectSource?: EffectActivation;
  effectSourceMarks?: ReadonlyMap<string, EffectSourceMark>;
  /** Which card the pointer is over, so the memory gauge can predict its play. */
  onHoverChange?: (instanceId: string | undefined) => void;
  cardWidth?: number;
  /** How much of a buried card stays tappable. */
  minExposure?: number;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const n = cards.length;
  // Large effect selections need whole hit targets: a tightly fanned neighbor
  // otherwise covers the card the player is trying to pick (GitHub #5058).
  const spreadSelection = selection !== undefined && n > 6;
  const [hoveredInstanceId, setHoveredInstanceId] = useState<string | null>(null);
  const [cursorInstanceId, setCursorInstanceId] = useState<string | null>(null);
  const [coveredHoverKey, setCoveredHoverKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (hoveredInstanceId && (draggingInstanceId || !cards.some((entry) => entry.instanceId === hoveredInstanceId))) {
      setHoveredInstanceId(null);
      setCoveredHoverKey(null);
    }
  }, [cards, hoveredInstanceId, draggingInstanceId]);
  const [rowEl, setRowEl] = useState<HTMLDivElement | null>(null);
  const [coveredSourceKey, setCoveredSourceKey] = useState<number | null>(null);
  const [preparedSourceKey, setPreparedSourceKey] = useState<number | null>(null);
  const reducedMotion = motionPreference.useReduced();
  const sourceSite = effectSource?.site;
  const sourceEntry =
    sourceSite?.zone === "hand"
      ? cards.find((entry) => entry.instanceId === sourceSite.instanceId && entry.cardId === effectSource?.cardId)
      : undefined;
  const sourcePreparing =
    !reducedMotion && sourceEntry && effectSource?.linked !== true && preparedSourceKey !== effectSource?.key;
  const rowWidth = useElementWidth(rowEl);
  const drawn = useEnterAnimation(cards.map((entry) => entry.instanceId));
  const arrivalArtReady = useHandArrivalArt(rowEl, drawn);
  // Both pointer and touch layouts indicate cards beyond either scroll edge.
  const touchLayout = useMediaQuery(TOUCH_LAYOUT_QUERY);
  const scrollByCard = (direction: -1 | 1) => {
    if (!rowEl) return;
    const step = direction * (cardWidth + HAND_TOUCH_GAP);
    if (typeof rowEl.scrollBy === "function") rowEl.scrollBy({ left: step, behavior: "smooth" });
    else rowEl.scrollLeft += step;
  };
  const copyLabels = buildHandCopyLabels(cards, selection, t);
  // The hand tightens its own fan until it fits the dock. Without this a big hand
  // simply grew past the board and painted over the sidebar.
  const overlap = spreadSelection ? 0 : handOverlap(n, rowWidth, cardWidth, minExposure);
  const handOverflows = rowWidth > 0 && n * cardWidth - overlap * Math.max(0, n - 1) > rowWidth - HAND_TILT_BLEED * 2;
  const overflow = useScrollOverflow(rowEl, n * 2 + Number(handOverflows));
  const { pointerPicked, tapSelection, inspect, beginPick, movePick, finishPick, cancelPick } =
    useHandPickGesture(selection);
  return (
    <div className="game-hand-scroller">
      <div
        ref={setRowEl}
        data-testid="hand"
        data-drop={selection ? undefined : "hand-you"}
        data-hand-overflow={handOverflows ? "true" : undefined}
        className={selection ? "game-hand game-hand--selecting" : "game-hand"}
        style={{
          position: "relative",
          boxSizing: "border-box",
          height: handRowHeight(cardWidth),
          minWidth: 0,
          paddingBottom: HAND_FAN_ROOM,
          display: "flex",
          justifyContent: "safe center",
          alignItems: "flex-end",
        }}
      >
        {cards.map((entry, i) => {
          const pickPosition = selection ? selection.pickedInstanceIds.indexOf(entry.instanceId) : -1;
          const picked = pickPosition !== -1;
          const pickable = selection?.selectableInstanceIds.includes(entry.instanceId) ?? false;
          const sel = selection ? picked : selectedInstanceId === entry.instanceId;
          const dragging = draggingInstanceId === entry.instanceId;
          const hov = hoveredInstanceId === entry.instanceId;
          const hoverKey = `${entry.instanceId}/${entry.artId ?? ""}`;
          const effectMark = effectSourceMarks?.get(entry.instanceId);
          const effectMarkLabel = effectMark ? t(getEffectSourceMarkLabelKey(effectMark)) : undefined;
          const showHover =
            hov &&
            !touchLayout &&
            !reducedMotion &&
            !sourcePreparing &&
            sourceEntry !== entry &&
            !draggingInstanceId &&
            (!drawn.has(entry.instanceId) || arrivalArtReady.has(entry.instanceId));
          const playable = selection
            ? pickable
            : entry.playableFromHand ||
              !!entry.negamonPlayEffectKey ||
              entry.digivolveTargetPermanentIds.length > 0 ||
              (entry.dnaDigivolveRoutes?.length ?? 0) > 0;
          const style = computeHandCardLayout({
            index: i,
            count: n,
            overlap,
            handOverflows,
            selected: sel,
            hovered: hov,
            dragging,
          });
          const events: HTMLAttributes<HTMLDivElement> = {
            onPointerDown: selection ? (e) => beginPick(entry.instanceId, e) : (e) => startDrag(i, e),
            onPointerMove: selection ? movePick : undefined,
            onPointerUp: selection ? (e) => finishPick(entry.instanceId, e) : undefined,
            onPointerCancel: selection ? cancelPick : undefined,
            onContextMenu: selection?.onInspect
              ? (event) => {
                  event.preventDefault();
                  inspect(entry.instanceId);
                }
              : undefined,
            onKeyDown: (event) => {
              if (selection?.onInspect && event.key === "Enter" && event.altKey) {
                event.preventDefault();
                selection.onInspect(entry.instanceId);
                return;
              }
              if (
                !selection &&
                onMoveCard &&
                event.altKey &&
                (event.key === "ArrowLeft" || event.key === "ArrowRight")
              ) {
                event.preventDefault();
                onMoveCard(entry.instanceId, event.key === "ArrowLeft" ? -1 : 1);
                return;
              }
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              if (selection) {
                if (pickable) selection.onToggle(entry.instanceId);
                return;
              }
              selectCard?.(i);
            },
            onClick: (event) => {
              if (selection) {
                if (pointerPicked.current === entry.instanceId) {
                  pointerPicked.current = null;
                  return;
                }
                tapSelection(entry.instanceId);
                return;
              }
              if (event.detail === 0) selectCard?.(i);
            },
            onFocus: (event) => {
              if (event.target !== event.currentTarget || !event.currentTarget.dataset.arenaFocused) return;
              setCursorInstanceId(entry.instanceId);
              if (!sourcePreparing) {
                setCoveredHoverKey(null);
                setHoveredInstanceId(entry.instanceId);
              }
              onHoverChange?.(entry.instanceId);
            },
            onBlur: (event) => {
              if (event.target !== event.currentTarget) return;
              setCursorInstanceId((current) => (current === entry.instanceId ? null : current));
              if (event.currentTarget.matches(":hover")) return;
              if (!sourcePreparing) setHoveredInstanceId((current) => (current === entry.instanceId ? null : current));
              onHoverChange?.(undefined);
            },
            onPointerEnter: (event) => {
              if (event.pointerType === "touch" || touchLayout) return;
              if (!sourcePreparing && hoveredInstanceId !== entry.instanceId) {
                setCoveredHoverKey(null);
                setHoveredInstanceId(entry.instanceId);
              }
              onHoverChange?.(entry.instanceId);
            },
            onPointerLeave: (event) => {
              const related = event.relatedTarget;
              if (
                related instanceof Element &&
                (related.closest<HTMLElement>("[data-hand-hover-instance-id]")?.dataset.handHoverInstanceId ===
                  entry.instanceId ||
                  related.closest<HTMLElement>("[data-hand-instance-id]")?.dataset.handInstanceId === entry.instanceId)
              )
                return;
              if (!sourcePreparing) setHoveredInstanceId(null);
              onHoverChange?.(undefined);
            },
          };
          const face = (
            <>
              <CardFull
                cardId={entry.cardId}
                artId={entry.artId}
                width={cardWidth}
                selected={sel}
                zoomOnHover={false}
              />
              {selection?.onInspect ? (
                <button
                  type="button"
                  className="game-hand-card__inspect"
                  data-arena-inspect
                  aria-label={t("game.inspectCard", {
                    card: getCardName(entry.cardId),
                  })}
                  tabIndex={-1}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    inspect(entry.instanceId);
                  }}
                >
                  <Icons.Search size={14} />
                </button>
              ) : null}
              {effectMark ? (
                <span className="game-hand-card__effect-mark" data-effect-mark={effectMark} aria-hidden="true" />
              ) : null}
              {picked ? (
                <span
                  className="game-hand-card__pick-badge"
                  aria-label={t("game.pickPosition", { position: pickPosition + 1 })}
                >
                  {pickPosition + 1}
                </span>
              ) : null}
            </>
          );
          return (
            <Fragment key={entry.instanceId}>
              <div
                data-hand-instance-id={entry.instanceId}
                aria-keyshortcuts={!selection && onMoveCard ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
                data-hand-card-id={entry.cardId}
                data-hand-hovered={hov ? "true" : undefined}
                data-effect-mark={effectMark}
                data-hand-hover-covered={showHover && coveredHoverKey === hoverKey ? "true" : undefined}
                data-effect-covered={
                  !reducedMotion && sourceEntry === entry && coveredSourceKey === effectSource?.key ? "true" : undefined
                }
                {...events}
                role="button"
                tabIndex={0}
                aria-label={
                  t(selection ? "game.pickCard" : "game.selectCard", {
                    card: getCardName(entry.cardId),
                  }) +
                  (copyLabels.has(entry.instanceId) ? `, ${copyLabels.get(entry.instanceId)}` : "") +
                  (effectMarkLabel ? `, ${effectMarkLabel}` : "") +
                  (picked ? `${t("overlay.selected")}, ${t("game.pickPosition", { position: pickPosition + 1 })}` : "")
                }
                aria-disabled={selection && !pickable ? true : undefined}
                aria-pressed={sel}
                className={[
                  "game-hand-card",
                  playable ? "game-hand-card--playable" : "",
                  drawn.has(entry.instanceId)
                    ? reducedMotion || arrivalArtReady.has(entry.instanceId)
                      ? "game-hand-card--drawn"
                      : "game-hand-card--arrival-pending"
                    : "",
                  selection && !pickable && !picked ? "game-hand-card--unpickable" : "",
                  selection && pickable && !picked ? "game-hand-card--pickable" : "",
                  picked ? "game-hand-card--picked" : "",
                  shakeInstanceId === entry.instanceId ? "game-hand-card--shake" : "",
                  (reducedMotion && sourceEntry === entry) ||
                  (!effectSource && effectSourceInstanceId === entry.instanceId)
                    ? "game-hand-card--effect-source"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  selection
                    ? // Nothing is dragged out of a hand that is answering a decision, so
                      // the row keeps its sideways pan on touch instead of claiming the
                      // gesture for a drag that cannot happen.
                      { ...style, cursor: pickable ? "pointer" : "default", touchAction: "pan-x" }
                    : style
                }
              >
                {face}
                {reorderDropBeforeInstanceId === entry.instanceId ||
                (reorderDropBeforeInstanceId === null && i === cards.length - 1) ? (
                  <span
                    aria-hidden="true"
                    className="game-hand-reorder-marker"
                    data-edge={reorderDropBeforeInstanceId === null ? "after" : "before"}
                  />
                ) : null}
              </div>
              {showHover && rowEl ? (
                <HandHoverFace
                  key={hoverKey}
                  instanceId={entry.instanceId}
                  row={rowEl}
                  className={[
                    playable ? "game-hand-card--playable" : "",
                    selection && !pickable && !picked ? "game-hand-card--unpickable" : "",
                    selection && pickable && !picked ? "game-hand-card--pickable" : "",
                    picked ? "game-hand-card--picked" : "",
                    cursorInstanceId === entry.instanceId ? "game-hand-card--cursor" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  events={events}
                  onReady={() => setCoveredHoverKey(hoverKey)}
                  onPress={(event, origin) => {
                    if (selection) beginPick(entry.instanceId, event);
                    else startDrag(i, event, origin);
                  }}
                >
                  {face}
                </HandHoverFace>
              ) : null}
            </Fragment>
          );
        })}
      </div>
      {!reducedMotion && effectSource && sourceEntry && rowEl ? (
        <HandSourceFocus
          key={effectSource.key}
          source={effectSource}
          entry={sourceEntry}
          row={rowEl}
          onReady={setCoveredSourceKey}
          onPrepared={setPreparedSourceKey}
          selected={
            selection
              ? selection.pickedInstanceIds.includes(sourceEntry.instanceId)
              : selectedInstanceId === sourceEntry.instanceId
          }
        />
      ) : null}
      {overflow.start ? <HandScrollCue direction="start" onClick={() => scrollByCard(-1)} /> : null}
      {overflow.end ? <HandScrollCue direction="end" onClick={() => scrollByCard(1)} /> : null}
    </div>
  );
}
