import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { CarouselState } from "@/packOpening/carousel/createCarouselState";
import { getCarouselStep } from "@/packOpening/carousel/getCarouselStep";

type Props = {
  carousel: RefObject<CarouselState>;
  count: number;
};

const FRICTION = 1.6;
const SNAP_SPEED = 1.4;
const SPRING = 11;

export function CarouselDriver({ carousel, count }: Props) {
  useFrame((_, rawDelta) => {
    const state = carousel.current;
    const delta = Math.min(rawDelta, 1 / 20);
    if (state.dragging) {
      return;
    }
    if (state.target === undefined) {
      state.angle += state.velocity * delta;
      state.velocity *= Math.exp(-FRICTION * delta);
      if (Math.abs(state.velocity) < SNAP_SPEED) {
        const step = getCarouselStep(count);
        state.target = Math.round(state.angle / step) * step;
      }
      return;
    }
    const offset = state.target - state.angle;
    state.velocity += (offset * SPRING - state.velocity * 2 * Math.sqrt(SPRING)) * delta;
    state.angle += state.velocity * delta;
    if (Math.abs(offset) < 0.0005 && Math.abs(state.velocity) < 0.001) {
      state.angle = state.target;
      state.velocity = 0;
    }
  });

  return null;
}
