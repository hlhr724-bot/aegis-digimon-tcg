type OverlayRect = {
  top: number;
  bottom: number;
  height: number;
};

type Params = {
  field: { top: number; height: number };
  overlays: readonly OverlayRect[];
};

const INSET_GAP = 6;
const MAX_INSET_RATIO = 0.3;

export function computeArenaFieldInsetTop({ field, overlays }: Params): number {
  const middle = field.top + field.height / 2;
  const overlayBottom = overlays.reduce(
    (bottom, overlay) => (overlay.height > 0 && overlay.top < middle ? Math.max(bottom, overlay.bottom) : bottom),
    field.top,
  );
  if (overlayBottom <= field.top) {
    return 0;
  }
  return Math.min(overlayBottom - field.top + INSET_GAP, field.height * MAX_INSET_RATIO);
}
