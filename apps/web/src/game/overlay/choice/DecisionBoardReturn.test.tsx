// @vitest-environment jsdom

import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import { DecisionBoardReturn } from "./DecisionBoardReturn";
import { DecisionViewBoardButton } from "./DecisionViewBoardButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top } as DOMRect;
}

function Decision() {
  const [viewingBoard, setViewingBoard] = useState(false);
  const returnControlRef = useRef<HTMLDivElement>(null);
  return viewingBoard ? (
    <DecisionBoardReturn returnControlRef={returnControlRef} onReturn={() => setViewingBoard(false)} />
  ) : (
    <DecisionViewBoardButton onOpenBoard={() => setViewingBoard(true)} />
  );
}

describe("DecisionBoardReturn", () => {
  function openBoard() {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("decision-board-return") ? rect(0, 0, 320, 56) : rect(400, 520, 200, 40);
    });
    render(
      <I18nProvider>
        <Decision />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /view board/i }));
    return screen.getByRole("button", { name: /return to decision/i }).parentElement!;
  }

  function dragHandle(toX: number, toY: number) {
    const handle = screen.getByRole("button", { name: /move decision bar/i });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: toX + 10, clientY: toY + 10 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
  }

  afterEach(() => localStorage.clear());

  it("opens on the left edge, level with View board, so the hand stays visible", () => {
    const control = openBoard();

    expect(control.hasAttribute("data-docked")).toBe(true);
    expect(control.style.getPropertyValue("--decision-return-left")).toBe("16px");
    expect(control.style.getPropertyValue("--decision-return-top")).toBe("512px");
  });

  it("moves by its drag handle and saves the position", () => {
    const control = openBoard();

    dragHandle(200, 300);

    expect(control.hasAttribute("data-dragged")).toBe(true);
    expect(control.style.getPropertyValue("--decision-return-drag-left")).toBe("200px");
    expect(control.style.getPropertyValue("--decision-return-drag-top")).toBe("300px");
    expect(JSON.parse(localStorage.getItem("aegis.decisionReturn.position")!)).toEqual({ left: 200, top: 300 });
  });

  it("reopens at the saved position", () => {
    openBoard();
    dragHandle(200, 300);
    fireEvent.click(screen.getByRole("button", { name: /return to decision/i }));

    fireEvent.click(screen.getByRole("button", { name: /view board/i }));

    const control = screen.getByRole("button", { name: /return to decision/i }).parentElement!;
    expect(control.hasAttribute("data-dragged")).toBe(false);
    expect(control.style.getPropertyValue("--decision-return-left")).toBe("200px");
    expect(control.style.getPropertyValue("--decision-return-top")).toBe("300px");
  });

  it("forgets the saved position when Home resets the bar", () => {
    const control = openBoard();
    dragHandle(200, 300);

    fireEvent.keyDown(screen.getByRole("button", { name: /move decision bar/i }), { key: "Home" });

    expect(localStorage.getItem("aegis.decisionReturn.position")).toBeNull();
    expect(control.hasAttribute("data-dragged")).toBe(false);
    expect(control.style.getPropertyValue("--decision-return-left")).toBe("16px");
    expect(control.style.getPropertyValue("--decision-return-top")).toBe("512px");
  });

  it("ignores a corrupt saved position", () => {
    localStorage.setItem("aegis.decisionReturn.position", "{not json");

    const control = openBoard();

    expect(control.style.getPropertyValue("--decision-return-left")).toBe("16px");
  });

  it("keeps the fixed strip when no View board press told it where to appear", () => {
    render(
      <I18nProvider>
        <DecisionBoardReturn returnControlRef={{ current: null }} onReturn={() => {}} />
      </I18nProvider>,
    );

    const control = screen.getByRole("button", { name: /return to decision/i }).parentElement!;
    expect(control.hasAttribute("data-docked")).toBe(false);
  });
});
