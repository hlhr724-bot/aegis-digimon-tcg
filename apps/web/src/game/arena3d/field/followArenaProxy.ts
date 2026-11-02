import { Vector3, type Camera } from "three";

type Params = {
  slot: HTMLElement | undefined;
  camera: Camera;
  size: { width: number; height: number };
  anchor: Vector3;
  rendered: Vector3;
};

const MIN_SHIFT = 0.1;
const anchorScratch = new Vector3();
const renderedScratch = new Vector3();
const appliedShifts = new WeakMap<HTMLElement, string>();

export function followArenaProxy({ slot, camera, size, anchor, rendered }: Params): void {
  if (!slot) {
    return;
  }
  anchorScratch.copy(anchor).project(camera);
  renderedScratch.copy(rendered).project(camera);
  const x = ((renderedScratch.x - anchorScratch.x) * size.width) / 2;
  const y = ((anchorScratch.y - renderedScratch.y) * size.height) / 2;
  const shift = Math.abs(x) < MIN_SHIFT && Math.abs(y) < MIN_SHIFT ? "" : `${x.toFixed(1)}px ${y.toFixed(1)}px`;
  if (appliedShifts.get(slot) === shift) {
    return;
  }
  appliedShifts.set(slot, shift);
  slot.style.translate = shift;
}
