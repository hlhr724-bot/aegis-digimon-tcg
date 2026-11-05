import { useContext, useLayoutEffect, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import type { Permanent } from "@aegis/shared";
import type { PerspectiveCamera } from "three";
import { CARD_DIMENSIONS } from "@/design/webglCard/cardDimensions";
import { Arena3dFieldContext } from "@/game/arena3d/field/Arena3dFieldContext";
import type { ArenaCameraFrame, ArenaScreenRect } from "@/game/arena3d/field/ArenaCameraFrame";
import type { ArenaRowSlot } from "@/game/arena3d/field/ArenaRowSlot";
import { ARENA_ROW_LAYOUT } from "@/game/arena3d/field/arenaWorldLayout";
import { computeArenaRowSlots } from "@/game/arena3d/field/computeArenaRowSlots";
import { getArenaColumnX } from "@/game/arena3d/field/getArenaColumnX";
import { measureArenaCardRect } from "@/game/arena3d/field/measureArenaCardRect";
import { projectArenaPoint } from "@/game/arena3d/field/projectArenaPoint";
import type { OrganizedCard } from "@/game/screen/layout/OrganizedBattleRow";
import type { FieldArrangement } from "@/game/screen/model/fieldArrangement";
import { Side } from "@/game/side";
import "@/game/arena3d/field/arena3dCardOverlay.css";

type RowAttributes = HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>;

type SlotBoxParams = {
  frame: ArenaCameraFrame;
  camera: PerspectiveCamera;
  slot: ArenaRowSlot;
};

type SlotBox = {
  rect: ArenaScreenRect;
  cardWidth: number;
  squash: number;
};

type Props = {
  side: Side;
  arrangement: FieldArrangement;
  isSuspended: (permanent: Permanent) => boolean;
  renderCard: (card: OrganizedCard) => ReactNode;
  rowProps: RowAttributes;
  emptyLabel: ReactNode;
};

const ROW_MARGIN_X = 0.4;
const ROW_FRONT_MARGIN = 1.05;
const ROW_BACK_MARGIN = 0.85;
const EFFECTS_ANCHOR_GAP = 0.25;
const EFFECTS_ANCHOR_WIDTH = 72;

function measureSlotBox({ frame, camera, slot }: SlotBoxParams): SlotBox {
  const length = slot.width * CARD_DIMENSIONS.height;
  const rect = measureArenaCardRect({
    frame,
    camera,
    x: slot.x,
    z: slot.z,
    width: slot.suspended ? length : slot.width,
    depth: slot.suspended ? slot.width : length,
  });
  const cardWidth = slot.suspended ? rect.width / CARD_DIMENSIONS.height : rect.width;
  const upright = slot.suspended ? cardWidth : cardWidth * CARD_DIMENSIONS.height;
  return { rect, cardWidth, squash: Math.min(1, rect.height / Math.max(1, upright)) };
}

export function Arena3dPositionedRow({ side, arrangement, isSuspended, renderCard, rowProps, emptyLabel }: Props) {
  const arena = useContext(Arena3dFieldContext);
  const lanes = arena?.frame.lanes;
  const slots = lanes ? computeArenaRowSlots({ side, lanes, arrangement, isSuspended }) : [];

  useLayoutEffect(() => {
    arena?.store.setRow(side, slots);
  });

  if (!arena || !lanes) {
    return null;
  }
  const { frame, camera } = arena;
  const direction = side === Side.Viewer ? 1 : -1;
  const nearDepth = direction * (lanes.digimonDepth - ROW_FRONT_MARGIN);
  const farDepth = direction * (lanes.supportDepth + ROW_BACK_MARGIN);
  const halfWidth = lanes.halfWidth + ROW_MARGIN_X;
  const corners = [
    projectArenaPoint({ frame, camera, x: -halfWidth, z: nearDepth }),
    projectArenaPoint({ frame, camera, x: halfWidth, z: nearDepth }),
    projectArenaPoint({ frame, camera, x: -halfWidth, z: farDepth }),
    projectArenaPoint({ frame, camera, x: halfWidth, z: farDepth }),
  ];
  const left = Math.min(...corners.map((corner) => corner.x));
  const top = Math.min(...corners.map((corner) => corner.y));
  const width = Math.max(...corners.map((corner) => corner.x)) - left;
  const height = Math.max(...corners.map((corner) => corner.y)) - top;
  const tileHalfWidth = ARENA_ROW_LAYOUT.cardWidth * 0.56;
  const anchorX =
    side === Side.Viewer
      ? getArenaColumnX(ARENA_ROW_LAYOUT.columns - 1, lanes) + tileHalfWidth + EFFECTS_ANCHOR_GAP
      : getArenaColumnX(0, lanes) - tileHalfWidth - EFFECTS_ANCHOR_GAP;
  const anchorZ = direction * lanes.digimonDepth - (ARENA_ROW_LAYOUT.cardWidth * CARD_DIMENSIONS.height) / 2;
  const anchor = projectArenaPoint({ frame, camera, x: anchorX, z: anchorZ });
  const anchorStart = side === Side.Viewer ? anchor.x : anchor.x - EFFECTS_ANCHOR_WIDTH;
  const anchorMaxStart = frame.canvasWidth - frame.fieldLeft - EFFECTS_ANCHOR_WIDTH;
  const anchorLeft = Math.min(Math.max(anchorStart, -frame.fieldLeft), anchorMaxStart) - left;
  const style: CSSProperties = {
    ...rowProps.style,
    position: "absolute",
    left,
    top,
    width,
    height,
    minHeight: 0,
    padding: 0,
    display: "block",
    flex: "none",
  };

  return (
    <div {...rowProps} style={style} data-arena-3d-row={side}>
      {slots.length === 0 ? <div className="arena-3d-row__empty">{emptyLabel}</div> : null}
      <span
        className="arena-3d-row__effects-anchor"
        data-field-effects-anchor={side}
        aria-hidden="true"
        style={{ left: anchorLeft, top: anchor.y - top, width: EFFECTS_ANCHOR_WIDTH }}
      />
      {slots.map((slot) => {
        const { rect, cardWidth, squash } = measureSlotBox({ frame, camera, slot });
        return (
          <div
            key={slot.fieldKey}
            className="arena-3d-slot"
            style={
              {
                left: rect.left - left,
                top: rect.top - top,
                width: rect.width,
                height: rect.height,
                transform: `scaleY(${squash.toFixed(3)})`,
                "--arena-3d-squash": squash.toFixed(3),
              } as CSSProperties
            }
          >
            {renderCard({
              permanent: slot.permanent,
              members: slot.members,
              width: cardWidth,
              fieldKey: slot.fieldKey,
              splitOff: false,
            })}
          </div>
        );
      })}
    </div>
  );
}
