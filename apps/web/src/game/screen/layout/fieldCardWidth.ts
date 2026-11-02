import { useSyncExternalStore } from "react";

/**
 * A row's card width from its height alone, and after narrowing to fit its width. A
 * single lane grows its own cards, so it also reports the width two lanes would draw:
 * the pieces beside the rows keep that size. Height-fitted is always the two-lane width.
 */
export interface RowCardWidths {
  heightFitted: number;
  drawn: number;
  beside: number;
}

/**
 * The card widths each battle row settled on, so the pieces beside the rows (security
 * and the raising area) can match them. Each row reports under its own key; readers get
 * the narrowest, which every row can show.
 *
 * The sideline columns are spaced from the height-fitted width. Spacing them from the
 * drawn width would loop: narrower cards free row width, which lets the cards grow back.
 */
const reports = new Map<string, RowCardWidths>();
const listeners = new Set<() => void>();
let narrowest: RowCardWidths | undefined;

function holdOnePixelShrink(heightFitted: number): number {
  return narrowest?.heightFitted === heightFitted + 1 ? narrowest.heightFitted : heightFitted;
}

function settle() {
  const all = [...reports.values()];
  const next = all.length
    ? {
        heightFitted: holdOnePixelShrink(Math.min(...all.map((widths) => widths.heightFitted))),
        drawn: Math.min(...all.map((widths) => widths.drawn)),
        beside: Math.min(...all.map((widths) => widths.beside)),
      }
    : undefined;
  if (
    next?.heightFitted === narrowest?.heightFitted &&
    next?.drawn === narrowest?.drawn &&
    next?.beside === narrowest?.beside
  )
    return;
  narrowest = next;
  for (const listener of listeners) listener();
}

export function reportFieldCardWidth(row: string, widths: RowCardWidths | undefined): void {
  if (widths === undefined) reports.delete(row);
  else reports.set(row, widths);
  settle();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFieldCardWidth(): RowCardWidths | undefined {
  return useSyncExternalStore(
    subscribe,
    () => narrowest,
    () => undefined,
  );
}
