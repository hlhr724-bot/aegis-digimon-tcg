import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { PerspectiveCamera } from "three";
import { useBattleLanePreference } from "@/design/battleLanes";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { Arena3dFieldContext, type Arena3dFieldContextValue } from "@/game/arena3d/field/Arena3dFieldContext";
import type { ArenaCameraFrame } from "@/game/arena3d/field/ArenaCameraFrame";
import {
  ARENA_MEMORY_TRACK,
  ARENA_PILE_CARD_WIDTH,
  ARENA_ROW_LAYOUT,
  ARENA_SECURITY_LAYOUT,
  type ArenaZoneKey,
  type ArenaZonePoint,
  type ArenaZoneSlots,
} from "@/game/arena3d/field/arenaWorldLayout";
import { computeArenaFieldInsetTop } from "@/game/arena3d/field/computeArenaFieldInsetTop";
import type { createArenaFieldFrame } from "@/game/arena3d/field/createArenaFieldFrame";
import type { ArenaFieldStore, ArenaZoneSlot } from "@/game/arena3d/field/createArenaFieldStore";
import { projectArenaPoint } from "@/game/arena3d/field/projectArenaPoint";
import { resolveArenaLanes } from "@/game/arena3d/field/resolveArenaLanes";
import { selectArenaLayoutVariant } from "@/game/arena3d/field/selectArenaLayoutVariant";
import { Side } from "@/game/side";
import "@/game/arena3d/field/arena3dField.css";

type Props = {
  board: RefObject<HTMLElement | null>;
  store: ArenaFieldStore;
  pileWidth: number;
  raisingWidth: number;
  portrait: boolean;
  children: ReactNode;
};

type Measurement = {
  canvasWidth: number;
  canvasHeight: number;
  left: number;
  top: number;
  width: number;
  height: number;
  insetTop: number;
};

const OVERLAY_SELECTOR = ".game-opponent-hand, .game-opponent-bar";
const MIN_FIELD_SIZE = 40;

type ProjectionParams = {
  frame: ArenaCameraFrame;
  camera: PerspectiveCamera;
};

type PositionStyleParams = ProjectionParams & {
  pileWidth: number;
  raisingWidth: number;
};

type ZoneWidthParams = ProjectionParams & {
  position: ArenaZonePoint;
  width: number;
};

type ZoneDepthParams = ProjectionParams & {
  position: ArenaZonePoint;
  depth: number;
};

type FieldFrameFactory = typeof createArenaFieldFrame;

const MEMORY_COIN_COUNT = 21;

let fieldFrameFactory: FieldFrameFactory | undefined;
let fieldFrameFactoryRequest: Promise<FieldFrameFactory> | undefined;

function loadFieldFrameFactory(): Promise<FieldFrameFactory> {
  fieldFrameFactoryRequest ??= import("@/game/arena3d/field/createArenaFieldFrame").then((module) => {
    fieldFrameFactory = module.createArenaFieldFrame;
    return module.createArenaFieldFrame;
  });
  return fieldFrameFactoryRequest;
}

function isSameMeasurement(a: Measurement | undefined, b: Measurement): boolean {
  return (
    a !== undefined &&
    Math.abs(a.canvasWidth - b.canvasWidth) < 1 &&
    Math.abs(a.canvasHeight - b.canvasHeight) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1 &&
    Math.abs(a.insetTop - b.insetTop) < 1
  );
}

function getZoneWorldWidth(zone: ArenaZone): number {
  if (zone === ArenaZone.SECURITY.value) {
    return ARENA_SECURITY_LAYOUT.tileWidth;
  }
  return zone === ArenaZone.RAISING.value ? ARENA_ROW_LAYOUT.cardWidth : ARENA_PILE_CARD_WIDTH;
}

function measureProjectedWidth({ frame, camera, position, width }: ZoneWidthParams): number {
  const left = projectArenaPoint({ frame, camera, x: position.x - width / 2, z: position.z });
  const right = projectArenaPoint({ frame, camera, x: position.x + width / 2, z: position.z });
  return right.x - left.x;
}

function measureProjectedDepth({ frame, camera, position, depth }: ZoneDepthParams): number {
  const far = projectArenaPoint({ frame, camera, x: position.x, z: position.z - depth / 2 });
  const near = projectArenaPoint({ frame, camera, x: position.x, z: position.z + depth / 2 });
  return near.y - far.y;
}

function listZoneSlots(zones: ArenaZoneSlots): [ArenaZoneKey, ArenaZonePoint][] {
  return Object.entries(zones).filter((entry): entry is [ArenaZoneKey, ArenaZonePoint] => entry[1] !== undefined);
}

function buildZoneSlots(zones: ArenaZoneSlots): Map<string, ArenaZoneSlot> {
  const slots = new Map<string, ArenaZoneSlot>();
  for (const [key, position] of listZoneSlots(zones)) {
    const [side, zone] = key.split(":") as [Side, ArenaZone];
    slots.set(key, { key, side, zone, x: position.x, z: position.z, width: getZoneWorldWidth(zone) });
  }
  return slots;
}

function buildPositionStyle({ frame, camera, pileWidth, raisingWidth }: PositionStyleParams): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, position] of listZoneSlots(frame.layout.zones)) {
    const [, zone] = key.split(":") as [Side, ArenaZone];
    const point = projectArenaPoint({ frame, camera, x: position.x, z: position.z });
    const name = key.replace(":", "-");
    style[`--arena-3d-${name}-x`] = `${point.x.toFixed(1)}px`;
    style[`--arena-3d-${name}-y`] = `${point.y.toFixed(1)}px`;
    if (zone === ArenaZone.SECURITY.value) {
      const tileLength = ARENA_SECURITY_LAYOUT.tileWidth * CARD_DIMENSIONS.height;
      style[`--arena-3d-${name}-w`] =
        `${measureProjectedWidth({ frame, camera, position, width: tileLength }).toFixed(1)}px`;
      style[`--arena-3d-${name}-h`] =
        `${measureProjectedDepth({ frame, camera, position, depth: ARENA_SECURITY_LAYOUT.maxDepth }).toFixed(1)}px`;
    } else {
      const width = measureProjectedWidth({ frame, camera, position, width: getZoneWorldWidth(zone) });
      const domWidth = zone === ArenaZone.RAISING.value ? raisingWidth : pileWidth;
      style[`--arena-3d-${name}-w`] = `${width.toFixed(1)}px`;
      style[`--arena-3d-${name}-scale`] = (width / Math.max(1, domWidth)).toFixed(3);
    }
  }
  const center = projectArenaPoint({ frame, camera, x: 0, z: 0 });
  const trackWidth = measureProjectedWidth({
    frame,
    camera,
    position: { x: 0, z: 0 },
    width: MEMORY_COIN_COUNT * ARENA_MEMORY_TRACK.coinSpacing * frame.layout.memoryScale,
  });
  style["--arena-3d-band-x"] = `${center.x.toFixed(1)}px`;
  style["--arena-3d-band-y"] = `${center.y.toFixed(1)}px`;
  style["--arena-3d-memory-width"] = `${trackWidth.toFixed(1)}px`;
  return style as CSSProperties;
}

export function Arena3dField({ board, store, pileWidth, raisingWidth, portrait, children }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState<Measurement | undefined>(undefined);
  const [createFrame, setCreateFrame] = useState<FieldFrameFactory | undefined>(() => fieldFrameFactory);
  const battleLanes = useBattleLanePreference();

  useEffect(() => {
    if (createFrame) {
      return;
    }
    let active = true;
    void loadFieldFrameFactory().then((factory) => {
      if (active) {
        setCreateFrame(() => factory);
      }
    });
    return () => {
      active = false;
    };
  }, [createFrame]);

  useEffect(() => {
    const element = container.current;
    const boardElement = board.current;
    if (!element || !boardElement) {
      return;
    }
    const measure = () => {
      const boardRect = boardElement.getBoundingClientRect();
      const shift = store.getOverlayShift();
      const shifted = element.getBoundingClientRect();
      const rect = new DOMRect(shifted.x - shift.x, shifted.y - shift.y, shifted.width, shifted.height);
      const overlays = Array.from(boardElement.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR), (overlay) =>
        overlay.getBoundingClientRect(),
      );
      const next = {
        canvasWidth: boardRect.width,
        canvasHeight: boardRect.height,
        left: rect.left - boardRect.left,
        top: rect.top - boardRect.top,
        width: rect.width,
        height: rect.height,
        insetTop: computeArenaFieldInsetTop({ field: rect, overlays }),
      };
      setMeasurement((current) => (isSameMeasurement(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(boardElement);
    for (const overlay of boardElement.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)) {
      observer.observe(overlay);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [board, store]);

  useEffect(() => {
    store.attachOverlay(container.current);
    return () => store.attachOverlay(null);
  }, [store]);

  const value = useMemo<Arena3dFieldContextValue | undefined>(() => {
    if (!createFrame || !measurement || measurement.width < MIN_FIELD_SIZE || measurement.height < MIN_FIELD_SIZE) {
      return undefined;
    }
    const field = {
      left: measurement.left,
      top: measurement.top + measurement.insetTop,
      width: measurement.width,
      height: measurement.height - measurement.insetTop,
    };
    const layout = selectArenaLayoutVariant({ portrait, width: field.width, height: field.height });
    const { frame, camera } = createFrame({
      canvasWidth: measurement.canvasWidth,
      canvasHeight: measurement.canvasHeight,
      field,
      origin: { left: measurement.left, top: measurement.top },
      layout,
      lanes: resolveArenaLanes(layout.lanes, battleLanes),
    });
    return { frame, camera, store };
  }, [createFrame, measurement, store, portrait, battleLanes]);

  useEffect(() => {
    if (value) {
      store.setFrame(value.frame, buildZoneSlots(value.frame.layout.zones));
    }
  }, [value, store]);

  const style = value ? buildPositionStyle({ ...value, pileWidth, raisingWidth }) : undefined;

  return (
    <div
      ref={container}
      className="arena-3d-field"
      style={style}
      data-ready={value ? true : undefined}
      data-arena-layout={value?.frame.layout.value}
      data-arena-lanes={value?.frame.lanes.count}
    >
      {value ? <Arena3dFieldContext.Provider value={value}>{children}</Arena3dFieldContext.Provider> : null}
    </div>
  );
}
