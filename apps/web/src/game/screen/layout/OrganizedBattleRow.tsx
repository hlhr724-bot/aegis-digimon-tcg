import { arenaAppearancePreference } from "@/design/arenaAppearance/arenaAppearancePreference";
import { ArenaUiScale } from "@/design/arenaAppearance/ArenaUiScale";
/* One side's battle area as two lanes: Digimon, and a lane of grouped Tamers and
   Options. A player who chooses one lane, and every phone, gets a single lane with
   the groups after the Digimon. The outer element keeps the row's class, so every
   breakpoint still places and sizes it as the single row it replaces; each lane
   scrolls on its own. */

import { useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import type { Permanent } from "@aegis/shared";
import { BattleRow, suspendedCardEdgeClearance } from "../../BattleRow";
import { carryGroupKeys, type FieldArrangement, type PreviousPlacement } from "../model/fieldArrangement";
import "../../style/fieldLayout.css";
import { linkCardOverhang, linkCardSlots, sourceFanStepLimit } from "../../boardModel";
import { COPY_EDGE_STEP, copyEdgeCount } from "../../piece/PermanentCopies";
import { reportFieldCardWidth, useFieldCardWidth } from "./fieldCardWidth";
import { CARD_SUSPEND_MOTION } from "../../../design/cardMotion";
import { BattleLanes } from "../../../design/battleLanes";
import { useBattleLanes } from "../hooks/useBattleLanes";
import { COARSE_POINTER_QUERY, useMediaQuery } from "../../../design/useMediaQuery";
import { twoRowsFit } from "./twoRowsFit";
import { motionPreference } from "@/design/motion/motionPreference";

const CARD_ASPECT = 1.4;
/** The design's --ds-touch-target minimum also applies to each permanent's button wrapper. */
const MIN_PERMANENT_HEIGHT = 44;
const LANE_GAP = 0;
/** The smallest Digimon stacked lanes shrink to, as a share of the layout's width. */
const MIN_STACKED_SHRINK = 0.6;
/** A crowded lane shrinks its cards to this share of the height-fitted width before it scrolls. */
const MIN_WIDTH_SHRINK = 0.75;
/** Portrait cards keep a readable size; crowded boards use their existing lane paging. */
const MIN_PORTRAIT_CARD_WIDTH = 65;
/** Enough sources to reach the fan's cap, which `sourceFanStepLimit` holds at a quarter of the card width. */
const FIXED_SIZE_SOURCE_RESERVE = 12;
/** Each lane's horizontal padding, from fieldLayout.css. */
const LANE_INLINE_PADDING = 16;
const DIGIMON_GAP_SHARE = 0.25;
const SUPPORT_GAP_SHARE = 0.3;
/** One lane has the row's whole height, so its cards may grow past the layout's card width, up to this share. */
const SINGLE_LANE_GROWTH = 1.2;
const TWO_ROW_GUIDE_SLOTS = 5;

export enum LanePlacement {
  Stacked = "stacked",
  SideBySide = "side-by-side",
  Merged = "merged",
}

interface LaneMetrics {
  /** Support cards as a share of the Digimon width. */
  supportScale: number;
  /** Digimon lane padding: keyword pills above, focus ring below. */
  digimonPadding: { top: number; bottom: number };
  /** Support lane padding: room above for the count chip and the copies peeking out. */
  supportPadding: { top: number; bottom: number };
}

const LANE_METRICS: Record<LanePlacement, LaneMetrics> = {
  [LanePlacement.Stacked]: {
    supportScale: 0.62,
    digimonPadding: { top: 18, bottom: 4 },
    supportPadding: { top: 11, bottom: 3 },
  },
  [LanePlacement.SideBySide]: {
    supportScale: 0.8,
    digimonPadding: { top: 9, bottom: 2 },
    supportPadding: { top: 11, bottom: 2 },
  },
  [LanePlacement.Merged]: {
    supportScale: 1,
    digimonPadding: { top: 9, bottom: 2 },
    supportPadding: { top: 9, bottom: 2 },
  },
};

export interface OrganizedCard {
  permanent: Permanent;
  /** Every permanent the drawn card stands for, itself included. */
  members: readonly Permanent[];
  width: number;
  /** Stable across renders while the card's copies stay together; also the React key. */
  fieldKey: string;
  /** The card was already on the field inside another group, so it slides out instead of entering. */
  splitOff: boolean;
}

/** Group layout movement runs independently of the artwork's quarter-turn. */
const MOTION_MS = 420;

interface DrawnCard {
  x: number;
  y: number;
  suspended: boolean;
  element: HTMLElement;
  art?: { element: HTMLElement; copy: HTMLElement; x: number; y: number; width: number; height: number; angle: number };
}

/** Where a card in flight is drawn, relative to its place in the layout. */
interface FlightOffset {
  x: number;
  y: number;
  angle: number;
}

interface GroupReturn {
  animation: Animation;
  memberIds: string[];
  targetMemberIds: string[];
  origin: { x: number; y: number };
  from: { x: number; y: number };
  to: { x: number; y: number };
}

const STILL: FlightOffset = { x: 0, y: 0, angle: 0 };
const flights = new WeakMap<Element, { animation: Animation; from: FlightOffset }>();
const artFlights = new WeakMap<HTMLElement, { animation: Animation; suspended: boolean; from: number }>();

function turnArtwork(art: HTMLElement, from: number, suspended: boolean) {
  artFlights.get(art)?.animation.cancel();
  const animation = art.animate([{ rotate: `${from}deg` }, { rotate: suspended ? "90deg" : "0deg" }], {
    duration: CARD_SUSPEND_MOTION.durationMs,
    fill: "backwards",
    easing: CARD_SUSPEND_MOTION.easing,
  });
  artFlights.set(art, { animation, suspended, from });
}

function artworkAngle(art: NonNullable<DrawnCard["art"]>): number {
  const flight = artFlights.get(art.element);
  const progress = flight?.animation.effect?.getComputedTiming().progress;
  return flight && progress !== null && progress !== undefined
    ? flight.from + ((flight.suspended ? 90 : 0) - flight.from) * progress
    : art.angle;
}

/** The offset a running slide still applies, read from the computed transform. */
function flightOffset(element: HTMLElement): FlightOffset {
  const flight = flights.get(element);
  if (!flight || flight.animation.playState === "finished" || flight.animation.playState === "idle") return STILL;
  const progress = flight.animation.effect?.getComputedTiming().progress;
  if (progress === null || progress === undefined) return STILL;
  return {
    x: flight.from.x * (1 - progress),
    y: flight.from.y * (1 - progress),
    angle: flight.from.angle * (1 - progress),
  };
}

/** A card's centre in its lane's scrolled content, so a scroll between two renders is not read as a move. */
function measureCards(row: HTMLElement): Map<string, DrawnCard> {
  const rowRect = row.getBoundingClientRect();
  const drawn = new Map<string, DrawnCard>();
  for (const element of row.querySelectorAll<HTMLElement>("[data-field-key]")) {
    const rect = element.getBoundingClientRect();
    const scroll = element.closest(".game-battle-lane")?.scrollLeft ?? 0;
    const art = element.querySelector<HTMLElement>(".game-card-enter > [data-state]");
    const artRect = art?.getBoundingClientRect();
    drawn.set(element.dataset.fieldKey!, {
      x: rect.left + rect.width / 2 - rowRect.left + scroll,
      y: rect.top + rect.height / 2 - rowRect.top,
      suspended: element.hasAttribute("data-suspended"),
      element,
      art:
        art && artRect
          ? {
              element: art,
              copy: art.cloneNode(true) as HTMLElement,
              x: artRect.left + artRect.width / 2 - rowRect.left + scroll,
              y: artRect.top + artRect.height / 2 - rowRect.top,
              width: art.offsetWidth,
              height: art.offsetHeight,
              angle: element.hasAttribute("data-suspended") ? 90 : 0,
            }
          : undefined,
    });
  }
  return drawn;
}

/**
 * Slides every card from where it was drawn last time to where it is now. A card split
 * off a group starts on that group and, when it was turned on the way out, starts
 * upright too, so it is seen leaving the stack and turning. A card still sliding when
 * the field changes again continues from where it is drawn. A resize only re-measures.
 */
function useFieldMotion(
  rowRef: React.RefObject<HTMLDivElement | null>,
  previous: React.RefObject<PreviousPlacement>,
  cards: readonly OrganizedCard[],
  isSuspended: (permanent: Permanent) => boolean,
  rowSize: { width: number; height: number },
) {
  const drawnBefore = useRef(new Map<string, DrawnCard>());
  const sizeBefore = useRef({ width: 0, height: 0 });
  const returns = useRef(new Map<HTMLElement, GroupReturn>());
  const heldOffsets = useRef(new Map<HTMLElement, FlightOffset>());
  const measuredSignature = useRef("");
  useEffect(() => {
    const stop = () => {
      for (const [copy, { animation }] of returns.current) {
        animation.cancel();
        artFlights.get(copy)?.animation.cancel();
        artFlights.delete(copy);
        copy.remove();
      }
      returns.current.clear();
      for (const element of heldOffsets.current.keys()) {
        element.style.translate = "";
        element.style.rotate = "";
      }
      heldOffsets.current.clear();
      for (const { element } of drawnBefore.current.values()) {
        flights.get(element)?.animation.cancel();
        const art = element.querySelector<HTMLElement>(".game-card-enter > [data-state]");
        if (art) {
          artFlights.get(art)?.animation.cancel();
          artFlights.delete(art);
        }
      }
    };
    const changed = () => {
      if (motionPreference.isReduced()) {
        stop();
      }
    };
    const unsubscribeMotion = motionPreference.subscribe(changed);
    return () => {
      unsubscribeMotion();
      stop();
    };
  }, [rowRef]);
  const signature = JSON.stringify([
    rowSize,
    cards.map((card) => [
      card.fieldKey,
      card.width,
      card.members.map((member) => [
        member.permanentId,
        isSuspended(member),
        member.stack.length,
        member.linked.length,
      ]),
    ]),
  ]);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const heldKeys = [...row.querySelectorAll<HTMLElement>("[data-field-key][data-stationary-departure]")].map(
      (element) => element.dataset.fieldKey!,
    );
    const nextSignature = JSON.stringify([signature, heldKeys]);
    if (measuredSignature.current === nextSignature) return;
    measuredSignature.current = nextSignature;
    const size = { width: row.clientWidth, height: row.clientHeight };
    const resized = size.width !== sizeBefore.current.width || size.height !== sizeBefore.current.height;
    const reduceMotion = motionPreference.isReduced();
    const offsets = new Map<Element, FlightOffset>();
    for (const element of row.querySelectorAll<HTMLElement>("[data-field-key]")) {
      const art = element.querySelector<HTMLElement>(".game-card-enter > [data-state]");
      const turn = art ? artFlights.get(art) : undefined;
      const suspended = element.hasAttribute("data-suspended");
      if (art && (reduceMotion || resized)) {
        turn?.animation.cancel();
        artFlights.delete(art);
      } else if (art && turn && turn.suspended !== suspended) {
        turnArtwork(art, Number.parseFloat(getComputedStyle(art).rotate) || 0, suspended);
      }
      offsets.set(element, heldOffsets.current.get(element) ?? flightOffset(element));
      flights.get(element)?.animation.cancel();
      // Measure the new layout without our previous static hold. Its offset is
      // reapplied below, keeping the painted position through later field changes.
      if (heldOffsets.current.has(element)) {
        element.style.translate = "";
        element.style.rotate = "";
        heldOffsets.current.delete(element);
      }
    }
    const drawn = measureCards(row);
    const returningPositions = new Map<string, { x: number; y: number; angle: number }>();
    // Shared card sizing can commit again before the first paint of a merge.
    // Keep the same return and its clock, updating its destination from its
    // current eased position instead of deleting it on every layout change.
    for (const [copy, flight] of returns.current) {
      const targets = cards.filter((card) =>
        card.members.some((member) => flight.memberIds.includes(member.permanentId)),
      );
      const target = targets.length === 1 ? targets[0] : undefined;
      const now = target ? drawn.get(target.fieldKey) : undefined;
      const sameGroup =
        target &&
        target.fieldKey === copy.dataset.returnTargetFieldKey &&
        target.members.length === flight.targetMemberIds.length &&
        target.members.every((member) => flight.targetMemberIds.includes(member.permanentId));
      const progress = flight.animation.effect?.getComputedTiming().progress ?? 0;
      if (resized || reduceMotion || !now?.art || !sameGroup) {
        // A member split back out during its return. Hand its painted position
        // to the actual card's FLIP instead of drawing both card and copy.
        if (
          !resized &&
          !reduceMotion &&
          now?.art &&
          target &&
          target.members.every((member) => flight.memberIds.includes(member.permanentId))
        ) {
          returningPositions.set(target.fieldKey, {
            x: flight.origin.x + flight.from.x * (1 - progress) + flight.to.x * progress,
            y: flight.origin.y + flight.from.y * (1 - progress) + flight.to.y * progress,
            angle: Number.parseFloat(getComputedStyle(copy).rotate) || 0,
          });
        }
        flight.animation.cancel();
        copy.remove();
        returns.current.delete(copy);
        artFlights.get(copy)?.animation.cancel();
        artFlights.delete(copy);
        continue;
      }
      copy.dataset.returnTargetFieldKey = target!.fieldKey;
      const to = { x: now.art.x - flight.origin.x, y: now.art.y - flight.origin.y };
      if (progress < 1 && (to.x !== flight.to.x || to.y !== flight.to.y)) {
        const from = {
          x: (flight.from.x * (1 - progress) + flight.to.x * progress - to.x * progress) / (1 - progress),
          y: (flight.from.y * (1 - progress) + flight.to.y * progress - to.y * progress) / (1 - progress),
        };
        (flight.animation.effect as KeyframeEffect).setKeyframes([
          { translate: `${from.x}px ${from.y}px`, opacity: 1 },
          { translate: `${to.x}px ${to.y}px`, opacity: 1 },
        ]);
        flight.from = from;
        flight.to = to;
      }
    }
    if (!resized && !reduceMotion) {
      for (const card of cards) {
        const now = drawn.get(card.fieldKey);
        if (!now || typeof now.element.animate !== "function") continue;
        const earlierKey = drawnBefore.current.has(card.fieldKey)
          ? card.fieldKey
          : card.members.map((member) => previous.current.get(member.permanentId)?.key).find(Boolean);
        const before = earlierKey ? drawnBefore.current.get(earlierKey) : undefined;
        const returning = returningPositions.get(card.fieldKey);
        if (!before && !returning) continue;
        const offset = before ? (offsets.get(before.element) ?? STILL) : STILL;
        const dx = returning && now.art ? returning.x - now.art.x : before!.x + offset.x - now.x;
        const dy = returning && now.art ? returning.y - now.art.y : before!.y + offset.y - now.y;
        // Turn only the art. Rotating the whole touch frame would sweep badges
        // and its empty corners outside the lane when a copy splits off.
        if (returning) {
          if (now.art && Math.abs(returning.angle - (now.suspended ? 90 : 0)) > 0.01)
            turnArtwork(now.art.element, returning.angle, now.suspended);
        } else if (before!.element !== now.element && before!.suspended !== now.suspended) {
          const art = now.element.querySelector<HTMLElement>(".game-card-enter > [data-state]");
          if (art) turnArtwork(art, before!.suspended ? 90 : 0, now.suspended);
        }
        const angle = !returning && before!.element === now.element ? offset.angle : 0;
        if (now.element.hasAttribute("data-stationary-departure")) {
          // A destruction target can be selected halfway through a layout slide.
          // Keep its current painted pose instead of finishing or restarting it.
          now.element.style.translate = `${dx}px ${dy}px`;
          now.element.style.rotate = `${angle}deg`;
          heldOffsets.current.set(now.element, { x: dx, y: dy, angle });
          continue;
        }
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(angle) < 1) continue;
        const flight = now.element.animate(
          [
            { translate: `${dx}px ${dy}px`, rotate: `${angle}deg` },
            { translate: "0px 0px", rotate: "0deg" },
          ],
          {
            duration: MOTION_MS,
            fill: "both",
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          },
        );
        // The document timeline can lag behind input in background browser tabs.
        // Use the current document clock and hold the origin until its next paint.
        flight.startTime = performance.now();
        flights.set(now.element, { animation: flight, from: { x: dx, y: dy, angle } });
      }
      // A removed visual whose members still exist has merged, rather than left play.
      // Keep only its artwork until it reaches the surviving group; it owns no input.
      for (const [oldKey, before] of drawnBefore.current) {
        if (drawn.has(oldKey) || !before.art) continue;
        const target = cards.find((card) =>
          card.members.some((member) => previous.current.get(member.permanentId)?.key === oldKey),
        );
        const now = target ? drawn.get(target.fieldKey) : undefined;
        if (!now?.art || typeof before.art.copy.animate !== "function") continue;
        const copy = before.art.copy;
        for (const node of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
          for (const attribute of [...node.attributes])
            if (attribute.name === "id" || attribute.name.startsWith("data-")) node.removeAttribute(attribute.name);
          node.style.animation = "none";
          node.style.transition = "none";
        }
        copy.setAttribute("aria-hidden", "true");
        copy.inert = true;
        copy.dataset.testid = "field-group-return";
        copy.dataset.returnTargetFieldKey = target!.fieldKey;
        copy.dataset.fieldMemberIds = JSON.stringify(
          [...previous.current].filter(([, placement]) => placement.key === oldKey).map(([id]) => id),
        );
        const scroll = now.element.closest(".game-battle-lane")?.scrollLeft ?? 0;
        const offset = offsets.get(before.element) ?? flightOffset(before.element);
        flights.get(before.element)?.animation.cancel();
        const fromAngle = artworkAngle(before.art);
        artFlights.get(before.art.element)?.animation.cancel();
        artFlights.delete(before.art.element);
        Object.assign(copy.style, {
          position: "absolute",
          left: `${before.art.x + offset.x - scroll - before.art.width / 2}px`,
          top: `${before.art.y + offset.y - before.art.height / 2}px`,
          width: `${before.art.width}px`,
          height: `${before.art.height}px`,
          margin: "0",
          translate: "0px 0px",
          rotate: now.suspended ? "90deg" : "0deg",
          pointerEvents: "none",
          zIndex: "2",
        });
        row.append(copy);
        // A landscape row can be static inside a positioned field. Convert into
        // the copy's actual containing block without changing the row's layout.
        const origin = copy.offsetParent instanceof HTMLElement ? copy.offsetParent : row;
        const originRect = origin.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        copy.style.left = `${rowRect.left - originRect.left - origin.clientLeft + before.art.x + offset.x - scroll - before.art.width / 2}px`;
        copy.style.top = `${rowRect.top - originRect.top - origin.clientTop + before.art.y + offset.y - before.art.height / 2}px`;
        if (Math.abs(fromAngle - (now.suspended ? 90 : 0)) > 0.01) turnArtwork(copy, fromAngle, now.suspended);
        const animation = copy.animate(
          [
            { translate: "0px 0px", opacity: 1 },
            {
              translate: `${now.art.x - before.art.x - offset.x}px ${now.art.y - before.art.y - offset.y}px`,
              opacity: 1,
            },
          ],
          { duration: MOTION_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "both" },
        );
        returns.current.set(copy, {
          animation,
          memberIds: [...previous.current].filter(([, placement]) => placement.key === oldKey).map(([id]) => id),
          targetMemberIds: target!.members.map((member) => member.permanentId),
          origin: { x: before.art.x + offset.x, y: before.art.y + offset.y },
          from: { x: 0, y: 0 },
          to: { x: now.art.x - before.art.x - offset.x, y: now.art.y - before.art.y - offset.y },
        });
        const remove = () => {
          copy.remove();
          returns.current.delete(copy);
        };
        animation.onfinish = remove;
        animation.oncancel = remove;
      }
    }
    for (const element of heldOffsets.current.keys()) {
      if (!row.contains(element)) heldOffsets.current.delete(element);
    }
    drawnBefore.current = drawn;
    sizeBefore.current = size;
    previous.current = new Map(
      cards.flatMap((card) =>
        card.members.map(
          (member) => [member.permanentId, { key: card.fieldKey, suspended: isSuspended(member) }] as const,
        ),
      ),
    );
  });
}

export interface LaneLayout {
  placement: LanePlacement;
  digimon: number;
  support: number;
}

interface LaneContent {
  digimonCount: number;
  supportCount: number;
  digimonSources?: number;
  supportSources?: number;
  digimonLinks?: number;
  supportLinks?: number;
  sourceTop?: number;
  sourceStep?: number;
  preferStacked?: boolean;
  /** Overrides the stacked support lane's share of the Digimon width. */
  supportScale?: number;
  /** Size the cards as if both lanes were full, so playing the first Tamer changes nothing. */
  reserveSupport?: boolean;
  /** Stacked lanes share the clearance between them: one lane's suspension sweep and the other's badge strip. */
  overlapLanes?: boolean;
  /** Shrink crowded lanes' cards, down to a floor, before they scroll. */
  fitWidth?: boolean;
  /** Draw one merged lane whatever the row's height. */
  singleLane?: boolean;
  twoRows?: boolean;
}

/** What a card adds to its lane's width beyond the card itself. */
export interface LaneCard {
  suspended: boolean;
  sources: number;
  links: number;
  copies: number;
}

function laneGap(width: number, preferStacked: boolean, share: number): number {
  return Math.max(preferStacked ? 20 : 12, Math.round(width * share));
}

/** Room at each end of a lane for a card turning sideways or its source fan. */
function laneEdge(width: number, sources: number, sourceStep: number): number {
  return Math.max(
    suspendedCardEdgeClearance(width),
    sources ? 12 + (sources - 1) * Math.min(sourceStep, sourceFanStepLimit(width, sources)) : 22,
  );
}

/** A lane's scroll width at a card width, matching PermanentView's inline margins. */
export function laneContentWidth(
  cards: readonly LaneCard[],
  width: number,
  gapShare: number,
  sourceStep: number,
  preferStacked = false,
): number {
  if (cards.length === 0) return 0;
  const suspendedMargin = Math.ceil(width * 0.2);
  const frames = cards.reduce((total, card) => {
    const turn = card.suspended ? suspendedMargin : 0;
    const start = card.sources
      ? Math.max(turn, 4 + (card.sources - 1) * Math.min(sourceStep, sourceFanStepLimit(width, card.sources)))
      : turn;
    const end = turn + linkCardOverhang(card.links, width) + copyEdgeCount(card.copies) * COPY_EDGE_STEP;
    return total + Math.max(MIN_PERMANENT_HEIGHT, width) + start + end;
  }, 0);
  const sources = Math.max(...cards.map((card) => card.sources));
  // The lane's flex gap also separates each end's turn clearance from the cards.
  return (
    frames +
    (cards.length + 1) * laneGap(width, preferStacked, gapShare) +
    2 * laneEdge(width, sources, sourceStep) +
    2 * LANE_INLINE_PADDING
  );
}

/**
 * Narrows lanes whose cards overflow the row's width, down to a floor. Past the
 * floor the lanes scroll rather than shrink cards past reading. Side-by-side lanes
 * share the row's width, so their widths add up.
 */
export function fitLanesToWidth(
  lanes: LaneLayout,
  rowWidth: number,
  cards: { digimon: readonly LaneCard[]; support: readonly LaneCard[] },
  content: LaneContent,
): LaneLayout {
  if (!content.fitWidth || rowWidth <= 0) return lanes;
  const scale = content.supportScale ?? LANE_METRICS[lanes.placement].supportScale;
  const supportFor = (width: number) => Math.max(22, Math.floor(width * scale));
  const step = content.sourceStep ?? 4;
  const preferStacked = content.preferStacked ?? false;
  const digimonWidth = (width: number) =>
    laneContentWidth(cards.digimon, width, DIGIMON_GAP_SHARE, step, preferStacked);
  const supportWidth = (width: number) =>
    laneContentWidth(cards.support, supportFor(width), SUPPORT_GAP_SHARE, step, preferStacked);
  const fits = {
    [LanePlacement.Stacked]: (width: number) => digimonWidth(width) <= rowWidth && supportWidth(width) <= rowWidth,
    [LanePlacement.SideBySide]: (width: number) => digimonWidth(width) + supportWidth(width) <= rowWidth,
    [LanePlacement.Merged]: (width: number) =>
      laneContentWidth([...cards.digimon, ...cards.support], width, DIGIMON_GAP_SHARE, step, preferStacked) <= rowWidth,
  }[lanes.placement];
  if (fits(lanes.digimon)) return lanes;
  const floor = preferStacked
    ? Math.min(lanes.digimon, MIN_PORTRAIT_CARD_WIDTH)
    : Math.ceil(lanes.digimon * MIN_WIDTH_SHRINK);
  const digimon = Math.max(floor, fittedWidth(lanes.digimon, fits));
  return { ...lanes, digimon, support: supportFor(digimon) };
}

function laneMetrics(placement: LanePlacement, content: LaneContent, widths = { digimon: 0, support: 0 }): LaneMetrics {
  const base = LANE_METRICS[placement];
  const shadow = content.preferStacked ? 8 : 10;
  const top = 22;
  const sourceBottom = (count = 0, width: number) =>
    count
      ? (content.sourceTop ?? 6) +
        (count - 1) * Math.min(content.sourceStep ?? 4, sourceFanStepLimit(width, count)) +
        shadow
      : shadow;
  const bottom = (sources: number | undefined, links = 0, width: number) => {
    const artworkHeight = Math.ceil(width * CARD_ASPECT);
    const frameHeight = Math.max(MIN_PERMANENT_HEIGHT, artworkHeight);
    // A small card's sources can use the otherwise empty part of its touch target.
    return Math.max(
      shadow,
      // The card's diagonal is its tallest extent halfway through suspension.
      Math.ceil((Math.hypot(width, artworkHeight) - frameHeight) / 2) + shadow,
      sourceBottom(sources, width) - (frameHeight - artworkHeight),
      ...linkCardSlots(links, width).map((slot) => slot.top + slot.height - frameHeight + shadow),
    );
  };
  return {
    ...base,
    digimonPadding: { top, bottom: bottom(content.digimonSources, content.digimonLinks, widths.digimon) },
    supportPadding: { top, bottom: bottom(content.supportSources, content.supportLinks, widths.support) },
  };
}

/**
 * How far stacked lanes may overlap. The facing lane's clearance below its cards only
 * holds a card mid-turn, never at rest, so it can share space with the next lane's
 * badge strip. The contact shadow stays clear.
 */
function laneOverlap(placement: LanePlacement, content: LaneContent, metrics: LaneMetrics): number {
  if (!content.overlapLanes || placement !== LanePlacement.Stacked) return 0;
  const shadow = content.preferStacked ? 8 : 10;
  const clearance = Math.min(metrics.digimonPadding.bottom, metrics.supportPadding.bottom) - shadow;
  return Math.max(0, Math.min(metrics.digimonPadding.top, metrics.supportPadding.top, clearance));
}

/** Largest integral width whose complete painted lane fits. */
function fittedWidth(ceiling: number, fits: (width: number) => boolean): number {
  let low = 1;
  let high = Math.floor(ceiling);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}
function laneHeight(width: number, padding: { top: number; bottom: number }) {
  return Math.max(MIN_PERMANENT_HEIGHT, Math.ceil(width * CARD_ASPECT)) + padding.top + padding.bottom;
}

function stackedWidths(rowHeight: number, layoutWidth: number, content: LaneContent): LaneLayout {
  const supportScale = content.supportScale ?? LANE_METRICS[LanePlacement.Stacked].supportScale;
  const supportWidth = (width: number) => Math.max(22, Math.floor(width * supportScale));
  const digimon = fittedWidth(layoutWidth, (width) => {
    const support = supportWidth(width);
    const metrics = laneMetrics(LanePlacement.Stacked, content, { digimon: width, support });
    return (
      laneHeight(width, metrics.digimonPadding) +
        laneHeight(support, metrics.supportPadding) +
        LANE_GAP -
        laneOverlap(LanePlacement.Stacked, content, metrics) <=
      rowHeight
    );
  });
  return { placement: LanePlacement.Stacked, digimon, support: supportWidth(digimon) };
}

/** Stacked widths, or undefined when stacking would shrink the Digimon past the floor. */
function stackedLanes(rowHeight: number, layoutWidth: number, content: LaneContent): LaneLayout | undefined {
  const stacked = stackedWidths(rowHeight, layoutWidth, content);
  const floor = content.preferStacked
    ? Math.min(layoutWidth, MIN_PORTRAIT_CARD_WIDTH)
    : layoutWidth * MIN_STACKED_SHRINK;
  return stacked.digimon < floor ? undefined : stacked;
}

/** A merged lane holds both kinds of card, so it clears the larger source fan and links. */
function mergedContent(content: LaneContent): LaneContent {
  return {
    ...content,
    digimonSources: Math.max(content.digimonSources ?? 0, content.supportSources ?? 0),
    digimonLinks: Math.max(content.digimonLinks ?? 0, content.supportLinks ?? 0),
  };
}

/** One lane at the row's full height; support cards match the Digimon. */
function mergedLanes(rowHeight: number, layoutWidth: number, content: LaneContent): LaneLayout {
  const placement = LanePlacement.Merged;
  const merged = mergedContent(content);
  const digimon = fittedWidth(
    layoutWidth,
    (width) =>
      laneHeight(width, laneMetrics(placement, merged, { digimon: width, support: 0 }).digimonPadding) <= rowHeight,
  );
  return { placement, digimon, support: digimon };
}

function sideBySideLanes(rowHeight: number, layoutWidth: number, content: LaneContent): LaneLayout {
  const placement = LanePlacement.SideBySide;
  const supportScale = content.supportScale ?? LANE_METRICS[placement].supportScale;
  const digimon = fittedWidth(
    layoutWidth,
    (width) =>
      laneHeight(width, laneMetrics(placement, content, { digimon: width, support: 0 }).digimonPadding) <= rowHeight,
  );
  const support = fittedWidth(
    Math.max(22, digimon * supportScale),
    (width) =>
      laneHeight(width, laneMetrics(placement, content, { digimon, support: width }).supportPadding) <= rowHeight,
  );
  if (supportScale === 1) {
    const width = Math.min(digimon, support);
    return { placement, digimon: width, support: width };
  }
  return { placement, digimon, support };
}

/**
 * Card widths that fit both lanes in the box the breakpoint gives the row. The layout's
 * width is the ceiling. Placement depends on available height, so splitting or
 * merging copies cannot flip the lanes or change every Digimon's size.
 */
export function fitLanes(row: { width: number; height: number }, layoutWidth: number, drawn: LaneContent): LaneLayout {
  if (drawn.singleLane) {
    const ceiling = Math.round(layoutWidth * SINGLE_LANE_GROWTH);
    return row.height <= 0
      ? { placement: LanePlacement.Merged, digimon: ceiling, support: ceiling }
      : mergedLanes(row.height, ceiling, drawn);
  }
  const content = drawn.reserveSupport
    ? { ...drawn, digimonCount: Math.max(1, drawn.digimonCount), supportCount: Math.max(1, drawn.supportCount) }
    : drawn;
  if (row.height <= 0) {
    return {
      placement: LanePlacement.Stacked,
      digimon: layoutWidth,
      support: Math.round(layoutWidth * (content.supportScale ?? LANE_METRICS[LanePlacement.Stacked].supportScale)),
    };
  }
  if (content.twoRows !== undefined && !content.preferStacked) {
    return content.twoRows
      ? stackedWidths(row.height, layoutWidth, content)
      : sideBySideLanes(row.height, layoutWidth, content);
  }
  if (content.supportCount === 0 || content.digimonCount === 0) {
    const placement = LanePlacement.Stacked;
    const digimon = fittedWidth(
      layoutWidth,
      (width) =>
        laneHeight(width, laneMetrics(placement, content, { digimon: width, support: 0 }).digimonPadding) <= row.height,
    );
    const support = fittedWidth(
      content.preferStacked ? 56 : layoutWidth * (content.supportScale ?? LANE_METRICS[placement].supportScale),
      (width) =>
        laneHeight(width, laneMetrics(placement, content, { digimon: 0, support: width }).supportPadding) <= row.height,
    );
    return { placement, digimon, support };
  }
  const stacked = stackedLanes(row.height, layoutWidth, content);
  if (stacked) {
    return stacked;
  }
  if (content.preferStacked) {
    return mergedLanes(row.height, layoutWidth, content);
  }
  return sideBySideLanes(row.height, layoutWidth, content);
}

/**
 * A board whose cards keep one size (`--field-fixed-width`) sizes them from the row alone: room for both lanes,
 * the widest source fan and no link cards, and no narrowing when a lane crowds. A crowded
 * lane scrolls instead.
 */
function fixedSizeContent(content: LaneContent): LaneContent {
  return {
    ...content,
    digimonCount: 1,
    supportCount: 1,
    digimonSources: FIXED_SIZE_SOURCE_RESERVE,
    supportSources: FIXED_SIZE_SOURCE_RESERVE,
    digimonLinks: 0,
    supportLinks: 0,
    reserveSupport: true,
    fitWidth: false,
  };
}

function twoRowReferenceContent(content: LaneContent): LaneContent {
  return {
    ...content,
    digimonCount: TWO_ROW_GUIDE_SLOTS,
    supportCount: 1,
    digimonSources: 0,
    supportSources: 0,
    digimonLinks: 0,
    supportLinks: 0,
    reserveSupport: true,
    singleLane: false,
    twoRows: undefined,
  };
}

function twoRowCandidate(row: { width: number; height: number }, layoutWidth: number, reference: LaneContent): number {
  const byHeight = stackedWidths(row.height, layoutWidth, reference).digimon;
  const guides = REFERENCE_LANE_CARDS.digimon;
  const step = reference.sourceStep ?? 4;
  const preferStacked = reference.preferStacked ?? false;
  return fittedWidth(
    byHeight,
    (width) => laneContentWidth(guides, width, DIGIMON_GAP_SHARE, step, preferStacked) <= row.width,
  );
}

const GUIDE_CARD: LaneCard = { suspended: false, sources: 0, links: 0, copies: 1 };
const REFERENCE_LANE_CARDS = {
  digimon: Array.from({ length: TWO_ROW_GUIDE_SLOTS }, () => GUIDE_CARD),
  support: [GUIDE_CARD],
};

function viewportTwoRows(
  row: { width: number; height: number },
  layoutWidth: number,
  content: LaneContent,
  coarsePointer: boolean,
): boolean {
  const reference = twoRowReferenceContent(content);
  const step = reference.sourceStep ?? 4;
  const preferStacked = reference.preferStacked ?? false;
  const sideBySideScale = reference.supportScale ?? LANE_METRICS[LanePlacement.SideBySide].supportScale;
  const sideBySideWidth = fittedWidth(
    sideBySideLanes(row.height, layoutWidth, reference).digimon,
    (width) =>
      laneContentWidth(REFERENCE_LANE_CARDS.digimon, width, DIGIMON_GAP_SHARE, step, preferStacked) +
        laneContentWidth(
          REFERENCE_LANE_CARDS.support,
          Math.max(22, Math.floor(width * sideBySideScale)),
          SUPPORT_GAP_SHARE,
          step,
          preferStacked,
        ) <=
      row.width,
  );
  return twoRowsFit({
    stackedWidth: twoRowCandidate(row, layoutWidth, reference),
    sideBySideWidth,
    coarsePointer,
  });
}

function capLanes(lanes: LaneLayout, width: number): LaneLayout {
  return { ...lanes, digimon: width, support: Math.round(width * (lanes.support / lanes.digimon)) };
}

function useRowSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: 0,
    height: 0,
    sourceTop: 6,
    sourceStep: 4,
    preferStacked: false,
    supportScale: undefined as number | undefined,
    reserveSupport: false,
    overlapLanes: false,
    fitWidth: false,
    fixedWidth: 0,
  });
  function measure() {
    const row = ref.current;
    if (!row) return;
    const style = getComputedStyle(row);
    const sourceTop = Number.parseFloat(style.getPropertyValue("--arena-source-top")) || 6;
    const sourceStep = Number.parseFloat(style.getPropertyValue("--arena-source-step")) || 4;
    const preferStacked = style.getPropertyValue("--field-prefer-stacked").trim() === "1";
    const supportScale = Number.parseFloat(style.getPropertyValue("--field-support-scale")) || undefined;
    const reserveSupport = style.getPropertyValue("--field-reserve-support").trim() === "1";
    const overlapLanes = style.getPropertyValue("--field-overlap-lanes").trim() === "1";
    const fitWidth = style.getPropertyValue("--field-fit-width").trim() === "1";
    const fixedWidth = Number.parseFloat(style.getPropertyValue("--field-fixed-width")) || 0;
    const width = row.clientWidth;
    const height = row.clientHeight;
    setSize((previous) =>
      previous.width === width &&
      previous.height === height &&
      previous.sourceTop === sourceTop &&
      previous.sourceStep === sourceStep &&
      previous.preferStacked === preferStacked &&
      previous.supportScale === supportScale &&
      previous.reserveSupport === reserveSupport &&
      previous.overlapLanes === overlapLanes &&
      previous.fitWidth === fitWidth &&
      previous.fixedWidth === fixedWidth
        ? previous
        : {
            width,
            height,
            sourceTop,
            sourceStep,
            preferStacked,
            supportScale,
            reserveSupport,
            overlapLanes,
            fitWidth,
            fixedWidth,
          },
    );
  }
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  });
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(row);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return { ref, size };
}

export function OrganizedBattleRow({
  arrangement,
  layoutWidth,
  supportFirst,
  digimonLabel,
  supportLabel,
  emptyLabel,
  renderCard,
  rowProps,
  isSuspended,
}: {
  arrangement: FieldArrangement;
  layoutWidth: number;
  /** The opponent's support lane sits toward their edge of the table, above their Digimon. */
  supportFirst: boolean;
  digimonLabel: string;
  supportLabel: string;
  emptyLabel: ReactNode;
  renderCard: (card: OrganizedCard) => ReactNode;
  rowProps: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>;
  isSuspended: (permanent: Permanent) => boolean;
}) {
  const { ref, size } = useRowSize();
  const { scale } = arenaAppearancePreference.useAppearance();
  const scaleFactor = Object.values(ArenaUiScale).find((entry) => entry.value === scale)!.factor;
  const singleLane = useBattleLanes() === BattleLanes.One;
  const previous = useRef<PreviousPlacement>(new Map());
  // A card stays split-off for as long as it is drawn: dropping the flag on a later
  // render would restart the entrance animation it skipped.
  const splitKeys = useRef(new Set<string>());
  const keysBefore = new Set([...previous.current.values()].map((placement) => placement.key));
  const card = (members: readonly Permanent[], fieldKey: string, width: number): OrganizedCard => ({
    permanent: members[0]!,
    members,
    width,
    fieldKey,
    splitOff:
      splitKeys.current.has(fieldKey) ||
      (!keysBefore.has(fieldKey) && members.some((member) => previous.current.has(member.permanentId))),
  });
  const hasSupport = arrangement.support.length > 0;
  const content = {
    digimonCount: arrangement.digimon.length,
    supportCount: arrangement.support.length,
    digimonSources: Math.max(0, ...arrangement.digimon.map((permanent) => permanent.stack.length)),
    supportSources: Math.max(
      0,
      ...arrangement.support.flatMap((group) => group.members.map((permanent) => permanent.stack.length)),
    ),
    digimonLinks: Math.max(0, ...arrangement.digimon.map((permanent) => permanent.linked.length)),
    supportLinks: Math.max(
      0,
      ...arrangement.support.flatMap((group) => group.members.map((permanent) => permanent.linked.length)),
    ),
    sourceTop: size.sourceTop,
    sourceStep: size.sourceStep,
    preferStacked: size.preferStacked,
    supportScale: size.supportScale,
    reserveSupport: size.reserveSupport,
    overlapLanes: size.overlapLanes,
    fitWidth: size.fitWidth,
    singleLane,
  };
  const laneCard = (members: readonly Permanent[]): LaneCard => ({
    suspended: isSuspended(members[0]!),
    sources: members[0]!.stack.length,
    links: members[0]!.linked.length,
    copies: members.length,
  });
  const laneCards = {
    digimon: arrangement.digimon.map((permanent) => laneCard([permanent])),
    support: arrangement.support.map((group) => laneCard(group.members)),
  };
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const fixedSize = size.fixedWidth > 0;
  const viewportPlaced = !fixedSize && !size.preferStacked && size.reserveSupport && size.height > 0;
  const twoRows = viewportPlaced ? viewportTwoRows(size, layoutWidth, content, coarsePointer) : undefined;
  const fittedContent = fixedSize ? fixedSizeContent(content) : { ...content, twoRows };
  const fit = (fitted: LaneContent) => {
    const lanes = fitLanes(size, layoutWidth, fitted);
    return fixedSize && lanes.digimon > size.fixedWidth ? capLanes(lanes, size.fixedWidth) : lanes;
  };
  const heightFitted = fit(fittedContent);
  const scaledMinimum = fixedSize ? size.fixedWidth * scaleFactor : layoutWidth;
  const ownLanes =
    scaleFactor > 1
      ? capLanes(heightFitted, Math.max(scaledMinimum, heightFitted.digimon))
      : fitLanesToWidth(heightFitted, size.width, laneCards, fittedContent);
  // Raising and security keep the size two lanes would give them; only a single lane's own cards grow.
  const twoLaneContent = { ...fittedContent, singleLane: false };
  const twoLaneHeightFitted = singleLane ? fit(twoLaneContent) : heightFitted;
  const twoLanes = singleLane ? fitLanesToWidth(twoLaneHeightFitted, size.width, laneCards, twoLaneContent) : ownLanes;
  const rowKey = useId();
  const reports = size.reserveSupport && size.height > 0;
  const stackedReferenceLanes = viewportPlaced
    ? fit({ ...twoRowReferenceContent(fittedContent), twoRows: true, fitWidth: true })
    : twoLaneHeightFitted;
  const reportedHeightFitted = reports ? stackedReferenceLanes.digimon : undefined;
  const reportedWidth = reports ? ownLanes.digimon : undefined;
  const reportedBeside = reports ? twoLanes.digimon : undefined;
  useEffect(
    () =>
      reportFieldCardWidth(
        rowKey,
        reportedHeightFitted === undefined || reportedWidth === undefined || reportedBeside === undefined
          ? undefined
          : {
              heightFitted: reportedHeightFitted / scaleFactor,
              drawn: reportedWidth / scaleFactor,
              beside: reportedBeside / scaleFactor,
            },
      ),
    [rowKey, reportedHeightFitted, reportedWidth, reportedBeside, scaleFactor],
  );
  useEffect(() => () => reportFieldCardWidth(rowKey, undefined), [rowKey]);
  // Rows sharing one card size follow the narrowest of them.
  const reportedSharedWidth = useFieldCardWidth()?.drawn;
  const sharedWidth = reportedSharedWidth === undefined ? undefined : reportedSharedWidth * scaleFactor;
  const lanes =
    reportedWidth !== undefined && sharedWidth !== undefined && sharedWidth < ownLanes.digimon
      ? {
          ...ownLanes,
          digimon: sharedWidth,
          support: Math.round(sharedWidth * (ownLanes.support / ownLanes.digimon)),
        }
      : ownLanes;
  const merged = lanes.placement === LanePlacement.Merged;
  const metrics = laneMetrics(lanes.placement, merged ? mergedContent(content) : content, lanes);
  const edge = (width: number, sources: number) => laneEdge(width, sources, size.sourceStep);
  const digimonCards = arrangement.digimon.map((permanent) => card([permanent], permanent.permanentId, lanes.digimon));
  const supportCards = carryGroupKeys(arrangement.support, previous.current, isSuspended).map((group) =>
    card(group.members, group.key, lanes.support),
  );
  const cards = [...digimonCards, ...supportCards];
  function emptySlots(drawn: readonly OrganizedCard[], width: number, gapShare: number): number {
    // Short rows devote their width to occupied cards; their guides still outline each card.
    if (lanes.placement === LanePlacement.SideBySide) return drawn.length === 0 ? 1 : 0;
    const occupied = drawn.map((drawnCard) => laneCard(drawnCard.members));
    const guide: LaneCard = { suspended: false, sources: 0, links: 0, copies: 1 };
    let count = 0;
    // Calculate the complete layout before useFieldMotion measures it. A child-only
    // placeholder update would otherwise shift cards after their flight was computed.
    while (count < 5 - drawn.length) {
      const proposed = [...occupied, ...Array.from({ length: count + 1 }, () => guide)];
      if (laneContentWidth(proposed, width, gapShare, size.sourceStep, size.preferStacked) > size.width) break;
      count++;
    }
    return Math.max(drawn.length === 0 ? 1 : 0, count);
  }
  const digimonSlots = emptySlots(merged ? cards : digimonCards, lanes.digimon, DIGIMON_GAP_SHARE);
  // Two lanes always draw the support lane, outlining its places like the Digimon lane's.
  const drawsSupportLane = !merged && (hasSupport || content.reserveSupport);
  const supportSlots = emptySlots(supportCards, lanes.support, SUPPORT_GAP_SHARE);
  useFieldMotion(ref, previous, cards, isSuspended, size);
  useLayoutEffect(() => {
    splitKeys.current = new Set(cards.filter((drawn) => drawn.splitOff).map((drawn) => drawn.fieldKey));
  });

  // A reserved Digimon lane stays drawn while empty, so the support lane never moves into it.
  const keepsDigimonSlot = content.reserveSupport && lanes.placement === LanePlacement.Stacked;
  const digimonLane = (
    <BattleRow
      key="digimon"
      className="game-battle-row game-battle-lane game-battle-lane--digimon"
      role="group"
      aria-label={digimonLabel}
      cardWidth={lanes.digimon}
      emptySlotCount={digimonSlots}
      emptyLabel={arrangement.digimon.length === 0 && !hasSupport ? emptyLabel : null}
      edgeClearance={edge(
        lanes.digimon,
        merged ? Math.max(content.digimonSources, content.supportSources) : content.digimonSources,
      )}
      style={{
        flex: "0 1 auto",
        minHeight: keepsDigimonSlot ? laneHeight(lanes.digimon, metrics.digimonPadding) : 0,
        display: "flex",
        gap: laneGap(lanes.digimon, size.preferStacked, DIGIMON_GAP_SHARE),
        justifyContent: "flex-start",
        alignItems: "center",
        ...({
          "--field-lane-top": `${metrics.digimonPadding.top}px`,
          "--field-lane-bottom": `${metrics.digimonPadding.bottom}px`,
        } as React.CSSProperties),
      }}
    >
      {digimonCards.map(renderCard)}
      {merged ? supportCards.map(renderCard) : null}
    </BattleRow>
  );

  const showsDigimonLane = merged || content.digimonCount > 0 || !hasSupport || keepsDigimonSlot;
  const supportLane = drawsSupportLane ? (
    <BattleRow
      key="support"
      className="game-battle-row game-battle-lane game-battle-lane--support"
      role="group"
      aria-label={supportLabel}
      cardWidth={lanes.support}
      emptySlotCount={supportSlots}
      edgeClearance={edge(lanes.support, content.supportSources)}
      style={{
        flex: "0 1 auto",
        display: "flex",
        gap: laneGap(lanes.support, size.preferStacked, SUPPORT_GAP_SHARE),
        justifyContent: "flex-start",
        alignItems: "center",
        ...({
          "--field-lane-top": `${metrics.supportPadding.top}px`,
          "--field-lane-bottom": `${metrics.supportPadding.bottom}px`,
        } as React.CSSProperties),
      }}
    >
      {supportCards.map(renderCard)}
    </BattleRow>
  ) : null;

  return (
    <div
      {...rowProps}
      ref={ref}
      data-field-layout="organized"
      data-lanes={lanes.placement}
      style={{
        ...rowProps.style,
        gap: LANE_GAP,
        ...({
          "--field-lane-overlap": `${drawsSupportLane ? laneOverlap(lanes.placement, content, metrics) : 0}px`,
        } as React.CSSProperties),
      }}
    >
      {supportFirst && !size.preferStacked
        ? [supportLane, showsDigimonLane ? digimonLane : null]
        : [showsDigimonLane ? digimonLane : null, supportLane]}
    </div>
  );
}
