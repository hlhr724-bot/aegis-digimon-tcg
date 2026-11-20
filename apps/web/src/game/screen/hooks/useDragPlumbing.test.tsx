// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Permanent, CardInstance } from "@aegis/shared";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useDragPlumbing } from "./useDragPlumbing";

afterEach(cleanup);
it.each(
  ["BT12-092", "AD1-021", "BT21-086", "BT13-095", "BT17-087", "BT4-092", "ST24-13"].flatMap((cardId) =>
    ["mouse", "touch"].map((pointerType) => ({ cardId, pointerType })),
  ),
)(
  "GitHub bugs #5036/#5032/#5020 permit attack input for transformed $cardId ($pointerType)",
  ({ cardId, pointerType }) => {
    const perm = new Permanent();
    perm.permanentId = "marcus";
    perm.topCard = new CardInstance();
    perm.topCard.cardId = cardId;
    perm.canAttackPlayer = true;
    const { result } = renderHook(useDragPlumbing);
    const target = document.createElement("div");
    act(() =>
      result.current.startPermDrag(perm, {
        pointerType,
        clientX: 20,
        clientY: 30,
        currentTarget: target,
        preventDefault: vi.fn(),
      } as unknown as ReactPointerEvent),
    );
    expect(result.current.drag).toMatchObject({ kind: "attack", permanentId: "marcus" });
  },
);
it("keeps ordinary Tamers and server-prohibited Digimon from opening attack input", () => {
  for (const cardId of ["BT12-092", "BT1-009"]) {
    const perm = new Permanent();
    perm.topCard = new CardInstance();
    perm.topCard.cardId = cardId;
    const { result, unmount } = renderHook(useDragPlumbing);
    act(() =>
      result.current.startPermDrag(perm, {
        pointerType: "touch",
        clientX: 0,
        clientY: 0,
        currentTarget: document.createElement("div"),
        preventDefault: vi.fn(),
      } as unknown as ReactPointerEvent),
    );
    expect(result.current.drag).toBeNull();
    unmount();
  }
});
it("follows the pointer without re-rendering the board on every move", () => {
  const perm = new Permanent();
  perm.permanentId = "attacker";
  perm.topCard = new CardInstance();
  perm.topCard.cardId = "BT1-009";
  perm.canAttackPlayer = true;
  let renders = 0;
  const { result } = renderHook(() => {
    renders += 1;
    return useDragPlumbing();
  });
  result.current.canDragRef.current = () => true;
  act(() =>
    result.current.startPermDrag(perm, {
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
      currentTarget: document.createElement("div"),
      preventDefault: vi.fn<() => void>(),
    } as unknown as ReactPointerEvent),
  );
  const move = (clientX: number, clientY: number) =>
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX, clientY }));
    });
  const afterPress = renders;
  move(101, 101);
  expect(renders).toBe(afterPress);
  expect(result.current.dragPointer.get()).toEqual({ x: 101, y: 101 });
  move(100, 200);
  expect(result.current.drag).toMatchObject({ kind: "attack", started: true });
  const afterStart = renders;
  move(110, 220);
  move(120, 240);
  expect(renders).toBe(afterStart);
  expect(result.current.dragPointer.get()).toEqual({ x: 120, y: 240 });
});
