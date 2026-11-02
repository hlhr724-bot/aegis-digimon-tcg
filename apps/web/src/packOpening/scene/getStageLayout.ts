import { CARD_DIMENSIONS } from "@/packOpening/scene/cardDimensions";

type Vector = [number, number, number];

type Params = {
  aspect: number;
  cardCount: number;
};

export interface CarouselLayout {
  center: Vector;
  radiusX: number;
  radiusZ: number;
}

export interface StageLayout {
  carousel: CarouselLayout;
  packScale: number;
  chargePosition: Vector;
  cardSlots: Vector[];
  cardScale: number;
  focusPosition: Vector;
  focusScale: number;
  inspectPosition: Vector;
  inspectScale: number;
  stackPosition: Vector;
  cameraPosition: Vector;
  cameraTarget: Vector;
}

const FIELD_OF_VIEW_HALF_TANGENT = Math.tan((40 / 2) * (Math.PI / 180));
const MINIMUM_VISIBLE_HEIGHT = 5.2;
const WIDE_CARD_SCALE = 0.72;
const WIDE_ASPECT = 1.25;
const NARROW_COLUMN_OPTIONS = [3, 4, 6];
const NARROW_GAP = 0.08;
const NARROW_GRID_DEPTH = 1.2;
const NARROW_GRID_FILL_WIDTH = 0.94;
const NARROW_GRID_FILL_HEIGHT = 0.92;
const FLOOR_CLEARANCE = 0.08;
const NARROW_FOCUS_DEPTH = 3.6;
const NARROW_FOCUS_FILL = 0.62;
const NARROW_INSPECT_DEPTH = 4.2;
const NARROW_INSPECT_FILL = 0.86;
const CAMERA_HEIGHT = 2.2;
const CAMERA_TARGET_HEIGHT = 1.6;

type GridParams = {
  cardCount: number;
  columns: number;
  spacingX: number;
  spacingY: number;
  centerY: number;
  depth: number;
};

function buildGrid({ cardCount, columns, spacingX, spacingY, centerY, depth }: GridParams): Vector[] {
  const rows = Math.ceil(cardCount / columns);
  return Array.from({ length: cardCount }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = (column - (columns - 1) / 2) * spacingX;
    const y = centerY + ((rows - 1) / 2 - row) * spacingY;
    return [x, y, depth];
  });
}

type DistanceParams = {
  aspect: number;
  visibleWidth: number;
};

function getCameraDistance({ aspect, visibleWidth }: DistanceParams): number {
  const fitWidth = visibleWidth / 2 / (FIELD_OF_VIEW_HALF_TANGENT * aspect);
  const fitHeight = MINIMUM_VISIBLE_HEIGHT / 2 / FIELD_OF_VIEW_HALF_TANGENT;
  return Math.max(fitWidth, fitHeight);
}

type View = {
  aspect: number;
  cameraDepth: number;
  lift: number;
};

type ViewAtDepth = View & {
  depth: number;
};

function getVisibleHeight({ cameraDepth, depth }: ViewAtDepth): number {
  return 2 * FIELD_OF_VIEW_HALF_TANGENT * (cameraDepth - depth);
}

function getViewCenterHeight({ cameraDepth, depth, lift }: ViewAtDepth): number {
  return CAMERA_TARGET_HEIGHT + lift + ((CAMERA_HEIGHT - CAMERA_TARGET_HEIGHT) * depth) / cameraDepth;
}

function getFloorLift(view: View): number {
  const viewAtGrid = { ...view, depth: NARROW_GRID_DEPTH };
  const viewBottom = getViewCenterHeight(viewAtGrid) - (NARROW_GRID_FILL_HEIGHT * getVisibleHeight(viewAtGrid)) / 2;
  return Math.max(0, FLOOR_CLEARANCE - viewBottom);
}

type FitParams = ViewAtDepth & {
  fill: number;
};

function getFittedCardScale({ fill, ...view }: FitParams): number {
  const height = getVisibleHeight(view);
  return fill * Math.min(height / CARD_DIMENSIONS.height, (height * view.aspect) / CARD_DIMENSIONS.width);
}

type NarrowGrid = {
  slots: Vector[];
  scale: number;
};

function buildNarrowGrid({ cardCount, ...view }: View & { cardCount: number }): NarrowGrid {
  const viewAtGrid = { ...view, depth: NARROW_GRID_DEPTH };
  const visibleHeight = getVisibleHeight(viewAtGrid);
  const visibleWidth = visibleHeight * view.aspect;
  const viewCenter = getViewCenterHeight(viewAtGrid);
  const top = viewCenter + (NARROW_GRID_FILL_HEIGHT * visibleHeight) / 2;
  const bottom = Math.max(FLOOR_CLEARANCE, viewCenter - (NARROW_GRID_FILL_HEIGHT * visibleHeight) / 2);
  const candidates = NARROW_COLUMN_OPTIONS.map((columns) => {
    const rows = Math.ceil(cardCount / columns);
    const gridWidth = columns * CARD_DIMENSIONS.width + (columns - 1) * NARROW_GAP;
    const gridHeight = rows * CARD_DIMENSIONS.height + (rows - 1) * NARROW_GAP;
    const scale = Math.min((NARROW_GRID_FILL_WIDTH * visibleWidth) / gridWidth, (top - bottom) / gridHeight);
    return { columns, scale };
  });
  const best = candidates.reduce((winner, candidate) => (candidate.scale > winner.scale ? candidate : winner));
  return {
    scale: best.scale,
    slots: buildGrid({
      cardCount,
      columns: best.columns,
      spacingX: (CARD_DIMENSIONS.width + NARROW_GAP) * best.scale,
      spacingY: (CARD_DIMENSIONS.height + NARROW_GAP) * best.scale,
      centerY: (top + bottom) / 2,
      depth: NARROW_GRID_DEPTH,
    }),
  };
}

export function getStageLayout({ aspect, cardCount }: Params): StageLayout {
  if (aspect >= WIDE_ASPECT) {
    const distance = getCameraDistance({ aspect, visibleWidth: 7.4 });
    return {
      carousel: { center: [0, 1.45, 0.2], radiusX: 2.9, radiusZ: 1.5 },
      packScale: 1,
      chargePosition: [0, 1.65, 2.7],
      cardSlots: buildGrid({
        cardCount,
        columns: 6,
        spacingX: 0.86,
        spacingY: CARD_DIMENSIONS.height * WIDE_CARD_SCALE + 0.13,
        centerY: 1.55,
        depth: 1.5,
      }),
      cardScale: WIDE_CARD_SCALE,
      focusPosition: [0, 1.85, 3.4],
      focusScale: 1.1,
      inspectPosition: [0, 1.9, 4],
      inspectScale: 1.43,
      stackPosition: [-2.45, 0.04, 1.7],
      cameraPosition: [0, 2.1, distance + 0.6],
      cameraTarget: [0, 1.4, 0],
    };
  }
  const distance = getCameraDistance({ aspect, visibleWidth: 3.9 });
  const unliftedView = { aspect, cameraDepth: distance + 0.6, lift: 0 };
  const view = { ...unliftedView, lift: getFloorLift(unliftedView) };
  const grid = buildNarrowGrid({ ...view, cardCount });
  const focusView = { ...view, depth: NARROW_FOCUS_DEPTH };
  const inspectView = { ...view, depth: NARROW_INSPECT_DEPTH };
  return {
    carousel: { center: [0, 1.95 + view.lift, 0.2], radiusX: 1.5, radiusZ: 1.2 },
    packScale: 0.86,
    chargePosition: [0, 1.75 + view.lift, 2.6],
    cardSlots: grid.slots,
    cardScale: grid.scale,
    focusPosition: [0, getViewCenterHeight(focusView), NARROW_FOCUS_DEPTH],
    focusScale: getFittedCardScale({ ...focusView, fill: NARROW_FOCUS_FILL }),
    inspectPosition: [0, getViewCenterHeight(inspectView), NARROW_INSPECT_DEPTH],
    inspectScale: getFittedCardScale({ ...inspectView, fill: NARROW_INSPECT_FILL }),
    stackPosition: [-1.05, 0.04, 1.5],
    cameraPosition: [0, CAMERA_HEIGHT + view.lift, view.cameraDepth],
    cameraTarget: [0, CAMERA_TARGET_HEIGHT + view.lift, 0],
  };
}
