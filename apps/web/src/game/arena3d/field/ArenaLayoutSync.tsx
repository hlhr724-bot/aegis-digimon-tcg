import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Camera } from "three";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { advanceArenaCardCueState } from "@/game/arena3d/cues/advanceArenaCardCueState";
import { createArenaCardCueState } from "@/game/arena3d/cues/createArenaCardCueState";
import { easeArenaFocus } from "@/game/arena3d/cues/easeArenaFocus";
import { findArenaSpotlightCenters } from "@/game/arena3d/cues/findArenaSpotlightCenters";
import { isArenaElementOffered } from "@/game/arena3d/cues/isArenaElementOffered";
import { readArenaProxyCue } from "@/game/arena3d/cues/readArenaProxyCue";
import { createArenaFloorProjector, type ArenaFloorProjector } from "@/game/arena3d/field/createArenaFloorProjector";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import type { ArenaRowSlot } from "@/game/arena3d/field/ArenaRowSlot";
import type { ArenaCardCue } from "@/game/arena3d/cues/ArenaCardCue";
import { createArenaDomWatch, type ArenaDomWatch } from "@/game/arena3d/field/createArenaDomWatch";
import type {
  ArenaCardPose,
  ArenaTrackedField,
  ArenaTrackedPermanent,
  ArenaTrackedZone,
} from "@/game/arena3d/field/ArenaTrackedField";
import { ARENA_ROW_LAYOUT } from "@/game/arena3d/field/arenaWorldLayout";
import { ARENA_VISIBLE_SOURCE_LIMIT } from "@/game/arena3d/field/arenaCardStackLayout";
import type {
  ArenaFieldSnapshot,
  ArenaFieldStore,
  ArenaOverlayShift,
} from "@/game/arena3d/field/createArenaFieldStore";
import type { ArenaRimEntry } from "@/game/arena3d/meshes/ArenaRim";
import type { ScreenPoint } from "@/game/arena3d/ArenaPulse";
import { readArenaProxyRim } from "@/game/arena3d/field/readArenaProxyRim";
import { readArenaZoneRim } from "@/game/arena3d/field/readArenaZoneRim";
import { shouldDeferArenaDomRead } from "@/game/arena3d/field/shouldDeferArenaDomRead";
import { Side } from "@/game/side";

type Props = {
  board: RefObject<HTMLElement | null>;
  store: ArenaFieldStore;
  field: ArenaTrackedField;
  breedingPermanents: ReadonlyMap<string, string>;
  projectionCamera: Camera;
  activity: RefObject<ArenaActivity>;
  reducedMotion: boolean;
};

type ZoneMeasureParams = {
  element: HTMLElement | null;
  zone: ArenaZone;
  projector: ArenaFloorProjector;
  scratch: { center: Vector3; edge: Vector3 };
};

type ShiftedCanvasParams = {
  canvas: HTMLCanvasElement;
  shift: Readonly<ArenaOverlayShift>;
};

type ProxyReading = {
  element: HTMLElement;
  slot: HTMLElement | undefined;
  cue: ArenaCardCue;
  rim: ArenaRimEntry | undefined;
  hidden: boolean;
  opacity: number;
};

type ProxyReadParams = {
  element: HTMLElement;
  side: Side;
  centers: readonly ScreenPoint[];
};

type DomReadings = {
  snapshot: ArenaFieldSnapshot | undefined;
  root: HTMLElement | null;
  proxies: Map<string, ProxyReading>;
  zones: Map<string, HTMLElement | null>;
  zoneRims: Map<string, ArenaRimEntry | undefined>;
  focusId: string | undefined;
};

type ZoneTrackParams = {
  field: ArenaTrackedField;
  snapshot: ArenaFieldSnapshot;
  readings: DomReadings;
  projector: ArenaFloorProjector;
  scratch: { center: Vector3; edge: Vector3 };
};

type RefreshParams = {
  readings: DomReadings;
  root: HTMLElement | null;
  snapshot: ArenaFieldSnapshot;
  playDropSides: Set<Side>;
};

const MOVE_RATE = 10;
const TURN_RATE = 9;
const PROXY_SELECTOR = ".game-field [data-arena-3d-row] .game-permanent[data-permanent-id]";
const SLOT_SELECTOR = ".arena-3d-slot";
const SLOT_CLASS = "arena-3d-slot";
const OVERLAY_CLASS = "arena-3d-field";
const PLAY_DROP_ROW_SELECTOR = '.game-field [data-arena-3d-row][data-drag-intent="play"]';
const ZONE_SELECTOR =
  ".game-utility-slot, .game-pile, .game-breeding-slot, .game-security-shield, .game-security-shield-wrap";
const FOCUS_SELECTOR = ".game-effect-focus[data-source-permanent-id]";
const POSE_EPSILON = 0.0005;
const OPACITY_EPSILON = 0.002;
const CHANGE_BUSY_MILLISECONDS = 250;
const DEFERRED_READ_BUSY_MILLISECONDS = 50;

function isSamePose(a: ArenaCardPose, b: ArenaCardPose): boolean {
  return (
    Math.abs(a.x - b.x) < POSE_EPSILON &&
    Math.abs(a.z - b.z) < POSE_EPSILON &&
    Math.abs(a.width - b.width) < POSE_EPSILON &&
    Math.abs(a.yaw - b.yaw) < POSE_EPSILON
  );
}

function isSameCue(a: ArenaCardCue, b: ArenaCardCue): boolean {
  return (
    a.channel === b.channel &&
    a.tint === b.tint &&
    a.shaking === b.shaking &&
    a.landing === b.landing &&
    a.offered === b.offered &&
    a.summoning === b.summoning
  );
}

function hasPermanentChanged(previous: ArenaTrackedPermanent | undefined, next: ArenaTrackedPermanent): boolean {
  return (
    !previous ||
    !isSamePose(previous.top, next.top) ||
    !isSamePose(next.top, next.target) ||
    previous.hidden !== next.hidden ||
    Math.abs(previous.opacity - next.opacity) > OPACITY_EPSILON ||
    previous.rim !== next.rim ||
    previous.slot !== next.slot ||
    previous.sources.length !== next.sources.length ||
    previous.links.length !== next.links.length ||
    !isSameCue(previous.cues.cue, next.cues.cue)
  );
}

function hasZoneChanged(previous: ArenaTrackedZone | undefined, next: ArenaTrackedZone): boolean {
  return !previous || previous.rim !== next.rim || !isSamePose(previous.pose, next.pose);
}

function hasSameSides(a: ReadonlySet<Side>, b: ReadonlySet<Side>): boolean {
  return a.size === b.size && [...a].every((side) => b.has(side));
}

function easeToward(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}

function buildTargetPose(slot: ArenaRowSlot): ArenaCardPose {
  return { x: slot.x, z: slot.z, width: slot.width, yaw: slot.suspended ? -Math.PI / 2 : 0 };
}

function buildSourcePoses(top: ArenaCardPose, count: number): ArenaCardPose[] {
  return Array.from({ length: Math.min(count, ARENA_VISIBLE_SOURCE_LIMIT) }, (_, index) => ({
    x: top.x - top.width * (0.05 + index * ARENA_ROW_LAYOUT.sourceStep),
    z: top.z + top.width * (0.05 + index * ARENA_ROW_LAYOUT.sourceStep),
    width: top.width,
    yaw: 0,
  }));
}

function buildLinkPoses(top: ArenaCardPose, count: number): ArenaCardPose[] {
  const halfFootprint =
    (Math.abs(Math.sin(top.yaw)) * CARD_DIMENSIONS.height + Math.abs(Math.cos(top.yaw))) * top.width * 0.5;
  return Array.from({ length: count }, (_, index) => ({
    x: top.x + halfFootprint + top.width * (0.18 + index * ARENA_ROW_LAYOUT.linkStep),
    z: top.z + top.width * 0.2,
    width: top.width * 0.86,
    yaw: Math.PI / 2,
  }));
}

function findZoneElement(root: HTMLElement, side: Side, zone: ArenaZone): HTMLElement | null {
  if (zone === ArenaZone.SECURITY.value) {
    return root.querySelector<HTMLElement>(`.arena-3d-field .game-security-shield--${side}`);
  }
  if (zone === ArenaZone.RAISING.value) {
    return root.querySelector<HTMLElement>(`.arena-3d-field .game-utility-slot--${side}-${zone} .game-breeding-slot`);
  }
  return root.querySelector<HTMLElement>(`.arena-3d-field .game-utility-slot--${side}-${zone} .game-pile`);
}

function measureZonePose({ element, zone, projector, scratch }: ZoneMeasureParams): ArenaCardPose | undefined {
  if (!element) {
    return undefined;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return undefined;
  }
  const cardWidth =
    zone === ArenaZone.SECURITY.value
      ? rect.width / CARD_DIMENSIONS.height
      : Math.min(rect.width, rect.height / CARD_DIMENSIONS.height);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  if (
    !projector.project(centerX, centerY, scratch.center) ||
    !projector.project(centerX + cardWidth, centerY, scratch.edge)
  ) {
    return undefined;
  }
  return { x: scratch.center.x, z: scratch.center.z, width: scratch.center.distanceTo(scratch.edge), yaw: 0 };
}

function getShiftedCanvasRect({ canvas, shift }: ShiftedCanvasParams): DOMRect {
  const rect = canvas.getBoundingClientRect();
  return new DOMRect(rect.x + shift.x, rect.y + shift.y, rect.width, rect.height);
}

function collectPlayDropSides(root: HTMLElement | null, sides: Set<Side>): void {
  sides.clear();
  for (const element of root?.querySelectorAll<HTMLElement>(PLAY_DROP_ROW_SELECTOR) ?? []) {
    const side = element.getAttribute("data-arena-3d-row");
    if (side === Side.Viewer || side === Side.Opponent) {
      sides.add(side);
    }
  }
}

function collectProxyElements(root: HTMLElement | null): Map<string, HTMLElement> {
  const proxies = new Map<string, HTMLElement>();
  for (const element of root?.querySelectorAll<HTMLElement>(PROXY_SELECTOR) ?? []) {
    const id = element.dataset.permanentId;
    if (id && !proxies.has(id)) {
      proxies.set(id, element);
    }
  }
  return proxies;
}

function removeTranslate(style: string | null): string {
  return (style ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration !== "" && !declaration.startsWith("translate:"))
    .join(";");
}

function isLayoutTarget(target: Node): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return (
    target.classList.contains(OVERLAY_CLASS) ||
    target.closest(ZONE_SELECTOR) !== null ||
    target.querySelector(ZONE_SELECTOR) !== null
  );
}

function isOwnStyleWrite(target: Node, previousStyle: string | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.classList.contains(SLOT_CLASS)) {
    return true;
  }
  return (
    target.classList.contains(OVERLAY_CLASS) &&
    removeTranslate(previousStyle) === removeTranslate(target.getAttribute("style"))
  );
}

function readProxy({ element, side, centers }: ProxyReadParams): ProxyReading {
  const offered = isArenaElementOffered({ element, centers });
  return {
    element,
    slot: element.closest<HTMLElement>(SLOT_SELECTOR) ?? undefined,
    cue: readArenaProxyCue({ element, offered }),
    rim: readArenaProxyRim({ element, side, offered }),
    hidden: element.style.visibility === "hidden",
    opacity: Number.parseFloat(element.style.opacity || "1"),
  };
}

function createDomReadings(): DomReadings {
  return {
    snapshot: undefined,
    root: null,
    proxies: new Map(),
    zones: new Map(),
    zoneRims: new Map(),
    focusId: undefined,
  };
}

function refreshDomReadings({ readings, root, snapshot, playDropSides }: RefreshParams): void {
  const centers = findArenaSpotlightCenters(root);
  const elements = collectProxyElements(root);
  readings.snapshot = snapshot;
  readings.root = root;
  readings.focusId = root?.querySelector(FOCUS_SELECTOR)?.getAttribute("data-source-permanent-id") ?? undefined;
  collectPlayDropSides(root, playDropSides);
  readings.proxies.clear();
  for (const side of [Side.Viewer, Side.Opponent]) {
    for (const slot of snapshot.rows[side]) {
      const element = elements.get(slot.permanent.permanentId);
      if (element) {
        readings.proxies.set(slot.permanent.permanentId, readProxy({ element, side, centers }));
      }
    }
  }
  readings.zones.clear();
  readings.zoneRims.clear();
  for (const zone of snapshot.zones.values()) {
    const element = root ? findZoneElement(root, zone.side, zone.zone) : null;
    readings.zones.set(zone.key, element);
    if (zone.zone === ArenaZone.SECURITY.value) {
      readings.zoneRims.set(
        zone.key,
        readArenaZoneRim({ element, side: zone.side, offered: isArenaElementOffered({ element, centers }) }),
      );
    }
  }
}

function trackZones({ field, snapshot, readings, projector, scratch }: ZoneTrackParams): boolean {
  const previousZones = new Map(field.zones);
  let changed = false;
  field.zones.clear();
  for (const zone of snapshot.zones.values()) {
    const pose = measureZonePose({
      element: readings.zones.get(zone.key) ?? null,
      zone: zone.zone,
      projector,
      scratch,
    });
    const tracked: ArenaTrackedZone = {
      key: zone.key,
      side: zone.side,
      zone: zone.zone,
      pose: pose ?? { x: zone.x, z: zone.z, width: zone.width, yaw: 0 },
      rim: readings.zoneRims.get(zone.key),
    };
    changed ||= hasZoneChanged(previousZones.get(zone.key), tracked);
    field.zones.set(zone.key, tracked);
  }
  return changed || previousZones.size !== field.zones.size;
}

export function ArenaLayoutSync({
  board,
  store,
  field,
  breedingPermanents,
  projectionCamera,
  activity,
  reducedMotion,
}: Props) {
  const gl = useThree((state) => state.gl);
  const projector = useMemo(createArenaFloorProjector, []);
  const scratch = useMemo(() => ({ center: new Vector3(), edge: new Vector3() }), []);
  const readings = useMemo(createDomReadings, []);
  const watch = useRef<ArenaDomWatch | undefined>(undefined);
  const deferredLastFrame = useRef(false);
  const pendingRefresh = useRef(false);
  const pendingLayout = useRef(false);
  const viewportMoved = useRef(false);
  const measuredSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const root = board.current;
    if (!root) {
      return;
    }
    const created = createArenaDomWatch({ root, isOwnStyleWrite, isLayoutTarget });
    const markMoved = () => {
      viewportMoved.current = true;
    };
    watch.current = created;
    window.addEventListener("scroll", markMoved, { capture: true, passive: true });
    window.addEventListener("resize", markMoved);
    return () => {
      created.disconnect();
      window.removeEventListener("scroll", markMoved, { capture: true });
      window.removeEventListener("resize", markMoved);
      watch.current = undefined;
    };
  }, [board]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 15);
    const move = reducedMotion ? 1 : 1 - Math.exp(-MOVE_RATE * delta);
    const turn = reducedMotion ? 1 : 1 - Math.exp(-TURN_RATE * delta);
    const snapshot = store.get();
    const root = board.current;
    const previousDropSides = new Set(field.playDropSides);
    const mutated = (watch.current?.consumeChanges() ?? true) || viewportMoved.current;
    pendingLayout.current ||= (watch.current?.consumeLayoutChanges() ?? true) || viewportMoved.current;
    viewportMoved.current = false;
    if (state.size.width !== measuredSize.current.width || state.size.height !== measuredSize.current.height) {
      measuredSize.current = { width: state.size.width, height: state.size.height };
      pendingLayout.current = true;
      pendingRefresh.current = true;
    }
    const structural = readings.snapshot !== snapshot || readings.root !== root;
    const deferred = shouldDeferArenaDomRead({
      mutated,
      structural,
      deferredLastFrame: deferredLastFrame.current,
      measured: field.zones.size === snapshot.zones.size,
    });
    deferredLastFrame.current = deferred;
    pendingRefresh.current ||= mutated;
    const refreshing = !deferred && (pendingRefresh.current || structural);
    if (refreshing) {
      pendingRefresh.current = false;
      refreshDomReadings({ readings, root, snapshot, playDropSides: field.playDropSides });
    }
    const time = state.clock.elapsedTime;
    const previousFocus = field.focus;
    let changed = !hasSameSides(previousDropSides, field.playDropSides);
    field.focus = easeArenaFocus({ focus: field.focus, targetId: readings.focusId, delta, reducedMotion });
    changed ||= previousFocus.permanentId !== field.focus.permanentId || previousFocus.level !== field.focus.level;
    if (deferred) {
      activity.current.busyUntil = Math.max(
        activity.current.busyUntil,
        performance.now() + DEFERRED_READ_BUSY_MILLISECONDS,
      );
    }
    if (refreshing && (pendingLayout.current || structural)) {
      pendingLayout.current = false;
      projector.begin(
        projectionCamera,
        getShiftedCanvasRect({ canvas: gl.domElement, shift: store.getOverlayShift() }),
      );
      changed ||= trackZones({ field, snapshot, readings, projector, scratch });
    }
    const seen = new Set<string>();
    for (const side of [Side.Viewer, Side.Opponent]) {
      for (const slot of snapshot.rows[side]) {
        const id = slot.permanent.permanentId;
        seen.add(id);
        const target = buildTargetPose(slot);
        const existing = field.permanents.get(id);
        const top: ArenaCardPose = existing
          ? {
              x: easeToward(existing.top.x, target.x, move),
              z: easeToward(existing.top.z, target.z, move),
              width: easeToward(existing.top.width, target.width, move),
              yaw: easeToward(existing.top.yaw, target.yaw, turn),
            }
          : target;
        const proxy = readings.proxies.get(id);
        const cues = advanceArenaCardCueState({
          previous: existing?.cues ?? createArenaCardCueState(),
          cue: proxy?.cue ?? createArenaCardCueState().cue,
          time,
        });
        const tracked: ArenaTrackedPermanent = {
          id,
          side,
          top,
          target,
          slot: proxy?.slot,
          sources: buildSourcePoses(top, slot.sourceCount),
          links: buildLinkPoses(top, slot.linkCount),
          rim: proxy?.rim,
          hidden: proxy?.hidden ?? false,
          opacity: proxy?.opacity ?? 1,
          cues,
        };
        changed ||= hasPermanentChanged(existing, tracked);
        field.permanents.set(id, tracked);
      }
    }
    for (const [zoneKey, id] of breedingPermanents) {
      const zone = field.zones.get(zoneKey);
      if (!zone) {
        continue;
      }
      seen.add(id);
      field.permanents.set(id, {
        id,
        side: zone.side,
        top: zone.pose,
        target: zone.pose,
        slot: undefined,
        sources: [],
        links: [],
        rim: undefined,
        hidden: false,
        opacity: 1,
        cues: field.permanents.get(id)?.cues ?? createArenaCardCueState(),
      });
    }
    for (const id of field.permanents.keys()) {
      if (!seen.has(id)) {
        field.permanents.delete(id);
        changed = true;
      }
    }
    if (changed) {
      activity.current.busyUntil = Math.max(activity.current.busyUntil, performance.now() + CHANGE_BUSY_MILLISECONDS);
    }
  });

  return null;
}
