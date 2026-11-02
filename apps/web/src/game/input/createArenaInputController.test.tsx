import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArenaInputController } from "@/game/input/createArenaInputController";

function getRect({ x = 0, y = 0 }: { x?: number; y?: number } = {}) {
  return { x, y, left: x, top: y, width: 60, height: 80, right: x + 60, bottom: y + 80, toJSON: () => ({}) } as DOMRect;
}

function mountBoard() {
  document.body.innerHTML = `<main class="game-layout"><div class="game-board">
    <div data-arena-region="hand"><button data-hand-instance-id="one">First card</button><button data-hand-instance-id="two">Second card</button><button data-hand-instance-id="three">Third card</button></div>
    <div data-arena-region="viewerField"><button data-permanent-id="attacker" data-inspectable="true">Attacker</button></div>
    <button data-arena-turn>End turn</button>
    </div></main>`;
  const root = document.querySelector<HTMLElement>(".game-board")!;
  const hand = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-hand-instance-id]"));
  hand.forEach((element, index) => {
    element.dataset.testX = String(index * 70);
    element.dataset.testY = "400";
  });
  const onCancel = vi.fn<() => void>();
  const controller = createArenaInputController({ getRoot: () => root, onCancel });
  return { root, hand, onCancel, controller };
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [getRect()] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return getRect({ x: Number(this.dataset.testX ?? 0), y: Number(this.dataset.testY ?? 0) });
  });
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("arena focus navigation", () => {
  it("navigates visible cards geometrically, stops at edges, and remembers each region", () => {
    const { controller, hand } = mountBoard();
    controller.handle("right");
    expect(document.activeElement).toBe(hand[1]);
    controller.handle("right");
    controller.handle("right");
    expect(document.activeElement).toBe(hand[2]);
    controller.handle("nextRegion");
    expect(document.activeElement?.getAttribute("data-permanent-id")).toBe("attacker");
    controller.handle("previousRegion");
    expect(document.activeElement).toBe(hand[2]);
  });

  it("keeps focus on the nearest remaining card and skips an emptied region", () => {
    const { controller, hand } = mountBoard();
    controller.handle("right");
    hand[1]!.remove();
    controller.refresh();
    expect(document.activeElement).toBe(hand[2]);
    hand[0]!.remove();
    hand[2]!.remove();
    controller.refresh();
    expect(document.activeElement?.getAttribute("data-permanent-id")).toBe("attacker");
  });

  it("activates only the topmost nested surface and restores both origins", () => {
    const { controller, hand, onCancel } = mountBoard();
    controller.handle("right");
    const outer = document.createElement("section");
    outer.setAttribute("role", "dialog");
    outer.style.zIndex = "100";
    outer.innerHTML = "<button data-arena-cancel>Close inspector</button><button>Attack</button>";
    document.body.append(outer);
    outer.querySelector("button")!.onclick = () => outer.remove();
    controller.refresh();
    const outerFocus = document.activeElement;
    const zoom = document.createElement("section");
    zoom.setAttribute("role", "dialog");
    zoom.style.zIndex = "200";
    zoom.innerHTML = "<button data-arena-cancel>Close zoom</button>";
    zoom.querySelector("button")!.onclick = () => zoom.remove();
    document.body.append(zoom);
    controller.refresh();
    controller.handle("cancel");
    expect(zoom.isConnected).toBe(false);
    expect(outer.isConnected).toBe(true);
    controller.refresh();
    expect(document.activeElement).toBe(outerFocus);
    controller.handle("cancel");
    controller.refresh();
    expect(document.activeElement).toBe(hand[1]);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cannot dismiss a mandatory decision or activate the board underneath", () => {
    const { controller, onCancel, hand } = mountBoard();
    const activated = vi.fn<() => void>();
    hand[0]!.onclick = activated;
    const dialog = document.createElement("section");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML =
      '<button disabled>Confirm selection</button><button aria-disabled="true">Unavailable</button><button>Select option</button>';
    document.body.append(dialog);
    const choose = vi.fn<() => void>();
    dialog.querySelectorAll("button")[2]!.onclick = choose;
    controller.handle("cancel");
    controller.handle("nextRegion");
    controller.handle("confirm");
    expect(choose).toHaveBeenCalledTimes(1);
    expect(activated).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("keeps board-backed choices navigable and returns to their dialog on cancel", () => {
    const { controller, hand, onCancel } = mountBoard();
    const rail = document.createElement("section");
    rail.className = "board-prompt";
    rail.innerHTML = "<button>Confirm picks</button>";
    document.body.append(rail);
    const openDialog = vi.fn<() => void>();
    rail.addEventListener("arena-input-cancel", (event) => {
      event.preventDefault();
      openDialog();
    });
    controller.handle("right");
    expect(document.activeElement).toBe(hand[1]);
    controller.handle("cancel");
    expect(openDialog).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("inspects a candidate without activating or selecting it", () => {
    const { controller, hand } = mountBoard();
    const select = vi.fn<() => void>();
    const inspect = vi.fn<() => void>();
    hand[0]!.onclick = select;
    hand[0]!.innerHTML += '<button data-arena-inspect tabindex="-1">Inspect</button>';
    hand[0]!.querySelector("button")!.onclick = (event) => {
      event.stopPropagation();
      inspect();
    };
    hand[0]!.focus();
    controller.handle("inspect");
    expect(inspect).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
  });
});

it("lets a controller leave text entry without cancelling the board selection", () => {
  const { controller, onCancel } = mountBoard();
  const chat = document.createElement("section");
  chat.setAttribute("data-arena-surface", "");
  chat.innerHTML = '<textarea aria-label="Chat"></textarea><button data-arena-cancel>Close</button>';
  chat.querySelector("button")!.onclick = () => chat.remove();
  document.body.append(chat);
  chat.querySelector("textarea")!.focus();
  controller.handle("cancel");
  expect(chat.isConnected).toBe(false);
  expect(onCancel).not.toHaveBeenCalled();
});

it("offers cancel on the board only when a back action is visible", () => {
  const { controller } = mountBoard();
  expect(controller.getHints().canCancel).toBe(false);
  const prompt = document.createElement("section");
  prompt.className = "board-prompt";
  prompt.innerHTML = "<button data-arena-cancel>Back</button>";
  document.body.append(prompt);
  expect(controller.getHints().canCancel).toBe(true);
});

it("jumps to the turn control and labels each actionable button", () => {
  const { controller, hand } = mountBoard();
  expect(controller.getPrompts()).toEqual([]);
  controller.handle("right");
  const turn = document.querySelector<HTMLElement>("[data-arena-turn]")!;
  expect(controller.getPrompts()).toEqual([
    { element: turn, command: "turn" },
    { element: hand[1], command: "confirm" },
    { element: hand[1], command: "inspect" },
  ]);
  controller.handle("turn");
  expect(document.activeElement).toBe(turn);
  expect(controller.getPrompts()).toEqual([{ element: turn, command: "confirm" }]);
});

it("reports no targets when nothing on the board is laid out", () => {
  const { controller } = mountBoard();
  expect(controller.hasTargets()).toBe(true);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [] as unknown as DOMRectList);
  expect(controller.hasTargets()).toBe(false);
});

it("moves the cursor to a newly suggested action and stops the first press there", () => {
  const { controller, hand } = mountBoard();
  const egg = document.createElement("div");
  egg.setAttribute("role", "button");
  egg.tabIndex = 0;
  egg.dataset.arenaSuggested = "true";
  const breeding = document.createElement("div");
  breeding.dataset.arenaRegion = "breeding";
  breeding.append(egg);
  document.querySelector(".game-board")!.append(breeding);
  controller.handle("right");
  expect(document.activeElement).toBe(egg);
  controller.handle("previousRegion");
  expect(document.activeElement).toBe(hand[0]);
  egg.remove();
  controller.refresh();
  const raising = egg.cloneNode() as HTMLElement;
  breeding.append(raising);
  controller.refresh();
  expect(document.activeElement).toBe(raising);
});
