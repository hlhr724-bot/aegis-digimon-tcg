// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { reportFieldCardWidth, useFieldCardWidth } from "@/game/screen/layout/fieldCardWidth";

const ROW = "row";

function widths(heightFitted: number) {
  return { heightFitted, drawn: heightFitted, beside: heightFitted };
}

afterEach(() => {
  act(() => reportFieldCardWidth(ROW, undefined));
});

it("holds the height-fitted width through a one-pixel shrink so the raising dock cannot flip it back", () => {
  const { result } = renderHook(useFieldCardWidth);
  act(() => reportFieldCardWidth(ROW, widths(141)));
  act(() => reportFieldCardWidth(ROW, widths(140)));
  expect(result.current?.heightFitted).toBe(141);
  act(() => reportFieldCardWidth(ROW, widths(141)));
  expect(result.current?.heightFitted).toBe(141);
});

it("follows a larger shrink and any growth of the height-fitted width", () => {
  const { result } = renderHook(useFieldCardWidth);
  act(() => reportFieldCardWidth(ROW, widths(141)));
  act(() => reportFieldCardWidth(ROW, widths(139)));
  expect(result.current?.heightFitted).toBe(139);
  act(() => reportFieldCardWidth(ROW, widths(140)));
  expect(result.current?.heightFitted).toBe(140);
});

it("keeps the drawn width exact", () => {
  const { result } = renderHook(useFieldCardWidth);
  act(() => reportFieldCardWidth(ROW, widths(141)));
  act(() => reportFieldCardWidth(ROW, { heightFitted: 140, drawn: 140, beside: 140 }));
  expect(result.current?.drawn).toBe(140);
});
