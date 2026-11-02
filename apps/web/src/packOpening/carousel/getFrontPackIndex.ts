import { getCarouselStep } from "@/packOpening/carousel/getCarouselStep";

type Params = {
  angle: number;
  count: number;
};

export function getFrontPackIndex({ angle, count }: Params): number {
  const slot = Math.round(-angle / getCarouselStep(count));
  return ((slot % count) + count) % count;
}
