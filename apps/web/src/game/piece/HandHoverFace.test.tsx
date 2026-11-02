// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import { Hand } from "./Hand";
import { TOUCH_LAYOUT_QUERY } from "../../design/useMediaQuery";
import type { HandEntry } from "./types";

vi.mock("../../design/cards", () => ({
  CardFull: ({ cardId, artId }: { cardId: string; artId?: string }) => (
    <div
      data-card-id={cardId}
      data-art-id={artId}
      style={{ width: 100, height: 140, opacity: 1, transition: "opacity 150ms" }}
    />
  ),
}));
const cards: HandEntry[] = ["a", "b", "c"].map((instanceId) => ({
  instanceId,
  cardId: "ST1-03",
  artId: `${instanceId}-art`,
  activatableEffectsJson: "[]",
  playableFromHand: true,
  projectedPlayCost: 2,
  digivolveTargetPermanentIds: [],
  linkTargetPermanentIds: [],
}));
beforeEach(() => {
  vi.stubGlobal(
    "DOMMatrix",
    class {
      a = 1;
      b = 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === "hand") return new DOMRect(0, 450, 600, 200);
    const slot = this.closest<HTMLElement>("[data-hand-instance-id]");
    const index = cards.findIndex((entry) => entry.instanceId === slot?.dataset.handInstanceId);
    return new DOMRect(100 + Math.max(0, index) * 110, 500, 100, 140);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function view(props: Partial<Parameters<typeof Hand>[0]> = {}) {
  return (
    <I18nProvider>
      <Hand cards={cards} startDrag={() => {}} {...props} />
    </I18nProvider>
  );
}
function origin(id: string) {
  return document.querySelector<HTMLElement>(`[data-hand-instance-id="${id}"]`)!;
}
function hover(id: string) {
  fireEvent.pointerOver(origin(id), { pointerType: "mouse" });
}

it("keeps the selected physical slot, accessible buttons and order when the hover changes", () => {
  const onToggle = vi.fn<(id: string) => void>();
  render(view({ selection: { selectableInstanceIds: ["a", "b"], pickedInstanceIds: ["a"], onToggle } }));
  const selected = origin("a");
  const rest = selected.style.transform;
  hover("a");
  const copy = document.querySelector('[data-hand-hover-instance-id="a"]')!;
  expect(copy.querySelector('[data-art-id="a-art"]')).toBeTruthy();
  expect(screen.getAllByRole("button")).toHaveLength(3);
  expect(selected.style.transform).toBe(rest);
  expect(selected.dataset.handHoverCovered).toBe("true");
  fireEvent.pointerOut(selected, { pointerType: "mouse", relatedTarget: copy });
  expect(document.querySelector('[data-hand-hover-instance-id="a"]')).toBe(copy);
  fireEvent.pointerOut(copy, { pointerType: "mouse", relatedTarget: origin("b") });
  hover("b");
  expect(document.querySelector('[data-hand-hover-instance-id="a"]')).toBeNull();
  expect(selected.dataset.handHoverCovered).toBeUndefined();
  expect(selected.getAttribute("aria-pressed")).toBe("true");
  expect(selected.style.transform).toBe(rest);
  expect([...screen.getByTestId("hand").children].map((node) => (node as HTMLElement).dataset.handInstanceId)).toEqual([
    "a",
    "b",
    "c",
  ]);
  expect(onToggle).not.toHaveBeenCalled();
});

it("forwards one pick and the original capture owner for a press on the enlarged face", () => {
  const startDrag = vi.fn<Parameters<typeof Hand>[0]["startDrag"]>();
  const rendered = render(view({ startDrag }));
  hover("b");
  fireEvent.pointerDown(document.querySelector('[data-hand-hover-instance-id="b"]')!, {
    pointerId: 7,
    pointerType: "mouse",
  });
  expect(startDrag).toHaveBeenCalledOnce();
  expect(startDrag.mock.calls[0]![0]).toBe(1);
  expect(startDrag.mock.calls[0]![2]).toBe(origin("b"));
  expect(document.querySelector('[data-hand-hover-instance-id="b"]')).not.toBeNull();
  rendered.rerender(view({ startDrag, draggingInstanceId: "b" }));
  expect(document.querySelector(".game-hand-hover")).toBeNull();
  rendered.rerender(view({ startDrag }));
  expect(document.querySelector(".game-hand-hover")).toBeNull();
  const onToggle = vi.fn<(id: string) => void>();
  rendered.rerender(view({ selection: { selectableInstanceIds: ["b"], pickedInstanceIds: [], onToggle } }));
  hover("b");
  const face = document.querySelector('[data-hand-hover-instance-id="b"]')!;
  fireEvent.pointerDown(face, { pointerId: 8, pointerType: "mouse", clientX: 220, clientY: 470 });
  fireEvent.pointerUp(face, { pointerId: 8, pointerType: "mouse", clientX: 220, clientY: 470 });
  fireEvent.click(face, { detail: 1 });
  expect(onToggle).toHaveBeenCalledExactlyOnceWith("b");
});

it("keeps the hovered physical copy across reorder and removes it when that copy leaves", () => {
  const rendered = render(view());
  hover("b");
  rendered.rerender(view({ cards: [cards[2]!, cards[1]!, cards[0]!] }));
  expect(document.querySelector('[data-hand-hover-instance-id="b"] [data-art-id="b-art"]')).toBeTruthy();
  rendered.rerender(view({ cards: [cards[2]!, cards[0]!] }));
  expect(document.querySelector(".game-hand-hover")).toBeNull();
  expect(origin("c").dataset.handHoverCovered).toBeUndefined();
  rendered.rerender(view({ cards: [cards[2]!, cards[1]!, cards[0]!] }));
  expect(document.querySelector(".game-hand-hover")).toBeNull();
  expect(origin("b").dataset.handHovered).toBeUndefined();
});

it("ignores touch hover and preserves the physical source's preparation lock", () => {
  const rendered = render(view());
  fireEvent.pointerOver(origin("a"), { pointerType: "touch" });
  expect(document.querySelector(".game-hand-hover")).toBeNull();
  rendered.rerender(
    view({ effectSource: { key: 7, seat: 0, cardId: "ST1-03", site: { zone: "hand", instanceId: "a" } } }),
  );
  hover("b");
  expect(origin("b").dataset.handHovered).toBeUndefined();
  expect(document.querySelector(".game-hand-hover")).toBeNull();
  const end = new Event("animationend", { bubbles: true });
  Object.defineProperty(end, "animationName", { value: "battle-hand-focus-scale" });
  fireEvent(document.querySelector(".game-hand-source-focus__scale")!, end);
  hover("a");
  expect(origin("a").dataset.handHovered).toBe("true");
  expect(document.querySelector(".game-hand-hover")).toBeNull();
  hover("b");
  expect(document.querySelector('[data-hand-hover-instance-id="b"]')).toBeTruthy();
  expect(document.querySelectorAll(".game-hand-source-focus")).toHaveLength(1);
});

it("keeps the physical hand visible on phone layouts instead of covering decision controls with a hover face", () => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: media === TOUCH_LAYOUT_QUERY,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const onToggle = vi.fn();
  render(view({ selection: { selectableInstanceIds: ["a"], pickedInstanceIds: [], onToggle } }));
  hover("a");
  expect(document.querySelector(".game-hand-hover")).toBeNull();
  expect(origin("a").dataset.handHoverCovered).toBeUndefined();
  fireEvent.keyDown(origin("a"), { key: "Enter" });
  expect(onToggle).toHaveBeenCalledExactlyOnceWith("a");
});
