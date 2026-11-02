export interface CarouselState {
  angle: number;
  velocity: number;
  target: number | undefined;
  dragging: boolean;
  dragDistance: number;
}

export function createCarouselState(): CarouselState {
  return { angle: 0, velocity: 0, target: undefined, dragging: false, dragDistance: 0 };
}
