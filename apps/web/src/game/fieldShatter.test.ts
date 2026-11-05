// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import fracture from "./fieldFracture.json";
import {
  captureFieldShatterFace,
  measureFieldShatterFace,
  resolveFieldDepartureFace,
  takeFieldShatterOrigin,
  useFieldShatterOrigin,
} from "./fieldShatter";

it.each([false, true])(
  "captures both grouped physical departures after their representative changes (stack=%s)",
  (includeStack) => {
    const board = document.createElement("div");
    board.className = "game-board";
    board.innerHTML = `<div data-permanent-id="first" style="rotate:none;transform:none;scale:none">
    <div class="game-card-enter" style="rotate:none;transform:none;scale:none">
      <div data-state="active" style="width:100px;height:140px;box-sizing:border-box;rotate:none;transform:none;scale:none">
        <img src="/physical-option.png" /><span>×2</span>
      </div>
    </div>
  </div>`;
    document.body.append(board);
    const permanent = board.firstElementChild as HTMLElement;
    const face = permanent.querySelector<HTMLElement>("[data-state]")!;
    let rect = new DOMRect(10, 20, 100, 140);
    face.getBoundingClientRect = () => rect;
    permanent.getBoundingClientRect = () => rect;
    board.getBoundingClientRect = () => new DOMRect(0, 0, 800, 1000);
    const styleOf = window.getComputedStyle.bind(window);
    const style = vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const computed = styleOf(element);
      Object.defineProperty(computed, Symbol.iterator, {
        value: function* () {
          for (let index = 0; index < computed.length; index++) yield computed.item(index);
        },
      });
      return computed;
    });
    try {
      const elements: Record<string, HTMLElement | null> = { first: permanent, second: permanent };
      const cached = measureFieldShatterFace(permanent, board)!;
      const first = resolveFieldDepartureFace({ id: "first", board, elements, cached, includeStack })!;
      expect(first.clone?.querySelector("img")?.getAttribute("src")).toBe("/physical-option.png");
      // The first hold releases: the same group's node now represents its second
      // member, while its cached pose still names the old representative.
      elements.first = null;
      permanent.dataset.permanentId = "second";
      face.querySelector("span")!.remove();
      rect = new DOMRect(120, 30, 100, 140);
      const second = resolveFieldDepartureFace({ id: "second", board, elements, cached, includeStack })!;
      expect(second).toMatchObject({ permanentId: "second", x: 170, y: 100, width: 100, height: 140 });
      expect(second.clone?.querySelector("img")?.getAttribute("src")).toBe("/physical-option.png");
      expect(second.clone?.querySelector("span")).toBeNull();
      expect(first).toMatchObject({ permanentId: "first", x: 60, y: 90 });
      expect(first.clone?.querySelector("span")?.textContent).toBe("×2");
      expect(Boolean(second.handStackClone?.querySelector("img"))).toBe(includeStack);
    } finally {
      style.mockRestore();
      board.remove();
    }
  },
);

it("freezes a departing face and both stack orientations from one descendant style snapshot", () => {
  const board = document.createElement("div");
  board.className = "game-board";
  board.innerHTML = `<div data-permanent-id="departing" style="rotate:none;transform:none;scale:none">
    <div class="game-card-enter" style="rotate:none;transform:none;scale:none">
      <div data-state="active" style="width:100px;height:140px;box-sizing:border-box;rotate:none;transform:none;scale:none;--unused-tint:red">
        <span id="chrome" tabindex="0" style="color:rgb(12,34,56);--caption:'text; with: separators'">Printed face</span>
      </div>
    </div>
  </div>`;
  document.body.append(board);
  const permanent = board.firstElementChild as HTMLElement;
  const face = permanent.querySelector<HTMLElement>("[data-state]")!;
  const label = face.querySelector("span")!;
  face.getBoundingClientRect = () => new DOMRect(10, 20, 100, 140);
  permanent.getBoundingClientRect = face.getBoundingClientRect;
  board.getBoundingClientRect = () => new DOMRect(0, 0, 800, 1000);
  const styleOf = window.getComputedStyle.bind(window);
  const style = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    if (pseudo) return { content: element === label ? '"caption"' : "none" } as CSSStyleDeclaration;
    const computed = styleOf(element);
    // The browser's declaration is iterable; jsdom's declaration needs this adapter.
    Object.defineProperty(computed, Symbol.iterator, {
      value: function* () {
        for (let index = 0; index < computed.length; index++) yield computed.item(index);
      },
    });
    return computed;
  });
  try {
    const captured = captureFieldShatterFace(permanent, board, true)!;
    expect(style.mock.calls.filter(([element, pseudo]) => element === label && !pseudo)).toHaveLength(1);
    label.style.color = "red";
    for (const clone of [captured.clone!, captured.stackClone!, captured.handStackClone!]) {
      const frozen = clone.querySelector("span")!;
      expect(frozen.style.color).toBe("rgb(12, 34, 56)");
      expect(frozen.style.getPropertyValue("--caption")).toBe("'text; with: separators'");
      expect(frozen.parentElement!.style.getPropertyValue("--unused-tint")).toBe("");
      expect(frozen.style.animation).toBe("none");
      expect(frozen.hasAttribute("id")).toBe(false);
      expect(frozen.hasAttribute("tabindex")).toBe(false);
      expect(clone.inert).toBe(true);
    }
    expect(captured).toMatchObject({ x: 60, y: 90, width: 100, height: 140, angle: 0 });
  } finally {
    style.mockRestore();
    board.remove();
  }
});

function contains(polygon: number[][], x: number, y: number) {
  let inside = false;
  polygon.forEach(([px, py], index) => {
    const [qx, qy] = polygon[(index + 1) % polygon.length]!;
    if (py! > y !== qy! > y && x < ((qx! - px!) * (y - py!)) / (qy! - py!) + px!) inside = !inside;
  });
  return inside;
}

it("the extracted irregular mesh covers the full printed plane without gaps or overlapping faces", () => {
  expect(fracture.polygons).toHaveLength(41);
  let area = 0;
  for (const polygon of fracture.polygons) {
    let twice = 0;
    polygon.forEach(([x, y], index) => {
      const [nx, ny] = polygon[(index + 1) % polygon.length]!;
      twice += x! * ny! - nx! * y!;
    });
    area += Math.abs(twice) / 2;
  }
  expect(area).toBeCloseTo(10000, 2);
  for (let x = 0.371; x < 100; x += 1.037)
    for (let y = 0.613; y < 100; y += 1.079)
      expect(fracture.polygons.filter((polygon) => contains(polygon, x, y))).toHaveLength(1);
});

it("reuses the departure face the queue just captured when the field removes that card", () => {
  const board = document.createElement("div");
  board.className = "game-board";
  board.innerHTML = `<div data-permanent-id="leaving" style="rotate:none;transform:none;scale:none">
    <div class="game-card-enter" style="rotate:none;transform:none;scale:none">
      <div data-state="active" style="width:100px;height:140px;box-sizing:border-box;rotate:none;transform:none;scale:none">
        <span>Printed face</span>
      </div>
    </div>
  </div>`;
  document.body.append(board);
  const permanent = board.firstElementChild as HTMLElement;
  const face = permanent.querySelector<HTMLElement>("[data-state]")!;
  face.getBoundingClientRect = () => new DOMRect(10, 20, 100, 140);
  permanent.getBoundingClientRect = face.getBoundingClientRect;
  board.getBoundingClientRect = () => new DOMRect(0, 0, 800, 1000);
  const styleOf = window.getComputedStyle.bind(window);
  const style = vi
    .spyOn(window, "getComputedStyle")
    .mockImplementation((element, pseudo) =>
      pseudo ? ({ content: "none" } as CSSStyleDeclaration) : styleOf(element),
    );
  const { result } = renderHook(() => useFieldShatterOrigin("leaving", "leaving-top"));
  result.current(permanent as HTMLDivElement);
  const departed = resolveFieldDepartureFace({
    id: "leaving",
    board,
    elements: { leaving: permanent },
    cached: undefined,
  })!;
  style.mockClear();
  try {
    result.current(null);
    expect(style).not.toHaveBeenCalled();
    const remembered = takeFieldShatterOrigin(board, "leaving")!;
    expect(remembered).toMatchObject({ x: departed.x, y: departed.y, width: departed.width });
    expect(remembered.clone).not.toBe(departed.clone);
    expect(remembered.clone!.textContent).toContain("Printed face");
  } finally {
    style.mockRestore();
    board.remove();
  }
});

it("keeps only the position of a departing face when a live 3D board draws the departure", () => {
  const board = document.createElement("div");
  board.className = "game-board";
  board.dataset.boardStyle = "arena3d";
  board.setAttribute("data-arena-3d-live", "");
  board.innerHTML = `<div class="arena-3d-scene"><canvas></canvas></div>
  <div data-permanent-id="leaving" style="rotate:none;transform:none;scale:none">
    <div class="game-card-enter" style="rotate:none;transform:none;scale:none">
      <div data-state="active" style="width:100px;height:140px;box-sizing:border-box;rotate:none;transform:none;scale:none"></div>
    </div>
  </div>`;
  document.body.append(board);
  const permanent = board.querySelector<HTMLElement>("[data-permanent-id]")!;
  const face = permanent.querySelector<HTMLElement>("[data-state]")!;
  face.getBoundingClientRect = () => new DOMRect(10, 20, 100, 140);
  board.getBoundingClientRect = () => new DOMRect(0, 0, 800, 1000);
  try {
    const departed = resolveFieldDepartureFace({
      id: "leaving",
      board,
      elements: { leaving: permanent },
      cached: undefined,
    })!;
    expect(departed).toMatchObject({ x: 60, y: 90, width: 100, height: 140 });
    expect(departed.clone).toBeUndefined();
  } finally {
    board.remove();
  }
});
