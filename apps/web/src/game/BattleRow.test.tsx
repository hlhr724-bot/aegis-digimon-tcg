// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { BattleRow, suspendedCardEdgeClearance } from "./BattleRow";

it("reserves enough scrollable edge room for the first and last cards to turn sideways", () => {
  const cardWidth = 230;
  const rotatedOverflow = (cardWidth * 1.4 - cardWidth) / 2;
  const clearance = suspendedCardEdgeClearance(cardWidth);

  expect(clearance).toBeGreaterThan(rotatedOverflow);
  const { container } = render(
    <I18nProvider>
      <BattleRow edgeClearance={clearance} aria-label="Battle area">
        <div>first card</div>
        <div>last card</div>
      </BattleRow>
    </I18nProvider>,
  );
  const spacers = container.querySelectorAll<HTMLElement>(".game-battle-row__turn-clearance");
  expect(spacers).toHaveLength(2);
  expect(spacers[0]?.style.flexBasis).toBe(`${clearance}px`);
  expect(spacers[1]?.style.flexBasis).toBe(`${clearance}px`);
});

it("keeps moving row measurements out of the synchronous render loop", () => {
  let top = 0;
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const measure = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(() => ({ left: 0, right: 300, top: ++top, height: 100 }) as DOMRect);
  try {
    const view = render(
      <I18nProvider>
        <BattleRow aria-label="Moving battle area">
          <div>card</div>
        </BattleRow>
      </I18nProvider>,
    );
    expect(measure.mock.calls.length).toBeLessThan(5);
    expect(frames.size).toBe(1);
    for (let frame = 0; frame < 20; frame += 1) {
      const callbacks = [...frames.values()];
      frames.clear();
      const previousMeasurements = measure.mock.calls.length;
      act(() => {
        for (const callback of callbacks) {
          callback(frame * 16);
        }
      });
      expect(measure.mock.calls.length - previousMeasurements).toBe(1);
      expect(frames.size).toBe(1);
    }
    view.unmount();
    expect(frames.size).toBe(0);
  } finally {
    measure.mockRestore();
    vi.unstubAllGlobals();
  }
});
