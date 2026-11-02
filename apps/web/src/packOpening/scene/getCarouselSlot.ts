import { getCarouselStep } from "@/packOpening/carousel/getCarouselStep";
import type { CarouselLayout } from "@/packOpening/scene/getStageLayout";

type Params = {
  index: number;
  count: number;
  angle: number;
  layout: CarouselLayout;
};

export interface CarouselSlot {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  frontness: number;
}

export function getCarouselSlot({ index, count, angle, layout }: Params): CarouselSlot {
  const slotAngle = index * getCarouselStep(count) + angle;
  const [centerX, centerY, centerZ] = layout.center;
  const frontness = (Math.cos(slotAngle) + 1) / 2;
  return {
    x: centerX + Math.sin(slotAngle) * layout.radiusX,
    y: centerY,
    z: centerZ + Math.cos(slotAngle) * layout.radiusZ,
    rotationY: Math.sin(slotAngle) * 0.6,
    frontness,
  };
}
