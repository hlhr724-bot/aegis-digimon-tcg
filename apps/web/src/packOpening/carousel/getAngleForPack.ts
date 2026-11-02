import { getCarouselStep } from "@/packOpening/carousel/getCarouselStep";

type Params = {
  angle: number;
  index: number;
  count: number;
};

export function getAngleForPack({ angle, index, count }: Params): number {
  const step = getCarouselStep(count);
  const base = -index * step;
  const turns = Math.round((angle - base) / (Math.PI * 2));
  return base + turns * Math.PI * 2;
}
