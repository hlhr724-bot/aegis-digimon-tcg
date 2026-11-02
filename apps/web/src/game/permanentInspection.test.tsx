// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { PermanentView } from "./piece";
import { BreedingSlot } from "@/game/piece/BreedingSlot";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function fieldCard() {
  const perm = new Permanent();
  perm.permanentId = "alphamon";
  perm.topCard = Object.assign(new CardInstance(), { instanceId: "top", cardId: "EX13-060" });
  perm.stack.push(Object.assign(new CardInstance(), { instanceId: "source", cardId: "EX13-057" }));
  return perm;
}

function setup(showInspect = true) {
  const choose = vi.fn<() => void>();
  const inspect = vi.fn<() => void>();
  const { container } = render(
    <I18nProvider>
      <PermanentView perm={fieldCard()} onClick={choose} onInspect={inspect} showInspect={showInspect} />
    </I18nProvider>,
  );
  return { choose, inspect, container, card: container.querySelector(".game-permanent")! };
}

it("hides the magnifier outside selection while keeping touch inspection available", () => {
  const { card, inspect } = setup(false);
  expect(screen.queryByRole("button", { name: "Read Alphamon" })).toBeNull();
  fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch" });
  vi.advanceTimersByTime(400);
  expect(inspect).toHaveBeenCalledOnce();
});

it("Discord 1556882561995644928: a touch hold reads a noncandidate without activating it or the trailing click", () => {
  const { card, choose, inspect } = setup();
  fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 50 });
  vi.advanceTimersByTime(400);
  expect(inspect).toHaveBeenCalledOnce();
  // A finger can stay down after the panel opens. Suppress the click on release, not on hold.
  vi.advanceTimersByTime(1000);
  fireEvent.pointerUp(card, { pointerId: 1, pointerType: "touch" });
  fireEvent.click(card, { detail: 1 });
  expect(choose).not.toHaveBeenCalled();
  expect(inspect).toHaveBeenCalledOnce();
});

it("keeps a short touch tap as the primary action", () => {
  const { card, choose, inspect } = setup();
  fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch" });
  vi.advanceTimersByTime(100);
  fireEvent.pointerUp(card, { pointerId: 1, pointerType: "touch" });
  fireEvent.click(card, { detail: 1 });
  vi.advanceTimersByTime(400);
  expect(choose).toHaveBeenCalledOnce();
  expect(inspect).not.toHaveBeenCalled();
});

it("reads a hold on the source-count badge without opening its tooltip or selecting a target", () => {
  const { card, inspect, choose } = setup();
  const badge = card.querySelector(".game-source-badge")!;
  expect(badge).not.toBeNull();
  fireEvent.pointerDown(badge, { pointerId: 1, pointerType: "touch" });
  vi.advanceTimersByTime(400);
  fireEvent.pointerUp(badge, { pointerId: 1, pointerType: "touch" });
  fireEvent.click(badge);
  expect(inspect).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it.each(["move", "cancel", "unmount"])("cancels a hold on %s", (action) => {
  const { card, inspect } = setup();
  fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 50 });
  if (action === "move") fireEvent.pointerMove(window, { pointerId: 1, clientX: 80, clientY: 50 });
  else if (action === "cancel") fireEvent.pointerCancel(window, { pointerId: 1 });
  else cleanup();
  vi.advanceTimersByTime(400);
  expect(inspect).not.toHaveBeenCalled();
});

it("reads from the magnifier keyboard shortcut without bubbling to the primary action", () => {
  const { choose, inspect } = setup();
  const button = screen.getByRole("button", { name: "Read Alphamon" });
  fireEvent.keyDown(button, { key: "Enter" });
  fireEvent.click(button, { detail: 0 });
  expect(inspect).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
});

it("reads a right-click without activating the card", () => {
  const { card, choose, inspect } = setup();
  fireEvent.contextMenu(card);
  expect(inspect).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
});

function renderBreedingSlot() {
  const move = vi.fn<() => void>();
  const inspect = vi.fn<() => void>();
  const { container } = render(
    <I18nProvider>
      <BreedingSlot perm={fieldCard()} label="Raising" focused onClick={move} onInspect={inspect} />
    </I18nProvider>,
  );
  return { move, inspect, card: container.querySelector(".game-permanent")! };
}

it("inspects a raised stack without bubbling to its move action", () => {
  const { move, inspect, card } = renderBreedingSlot();
  fireEvent.contextMenu(card);
  expect(inspect).toHaveBeenCalledOnce();
  expect(move).not.toHaveBeenCalled();
  const read = screen.getByRole("button", { name: "Read Alphamon" });
  fireEvent.keyDown(read, { key: "Enter" });
  fireEvent.click(read, { detail: 0 });
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(move).not.toHaveBeenCalled();
  fireEvent.click(card);
  expect(move).toHaveBeenCalledOnce();
});

it("holds a raised stack to read without moving on release", () => {
  const { move, inspect, card } = renderBreedingSlot();
  fireEvent.pointerDown(card, { pointerId: 1, pointerType: "touch" });
  vi.advanceTimersByTime(400);
  expect(inspect).toHaveBeenCalledOnce();
  fireEvent.pointerUp(card, { pointerId: 1, pointerType: "touch" });
  fireEvent.click(card, { detail: 1 });
  expect(move).not.toHaveBeenCalled();
});
