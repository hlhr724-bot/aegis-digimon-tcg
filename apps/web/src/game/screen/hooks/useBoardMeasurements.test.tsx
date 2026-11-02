import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CardInstance, Permanent, PlayerState } from "@aegis/shared";
import { useBoardMeasurements } from "@/game/screen/hooks/useBoardMeasurements";

vi.mock("../../fieldShatter", () => ({ measureFieldShatterFace: () => undefined }));

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("remeasures enlarged cards and scrolled targets without changing the board population", () => {
  const queued = new Map<number, FrameRequestCallback>();
  let frame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queued.set(++frame, callback);
    return frame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queued.delete(id));
  let notifyResize: ResizeObserverCallback | undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const board = document.createElement("div");
  const field = document.createElement("div");
  const card = document.createElement("div");
  board.append(field);
  field.append(card);
  document.body.append(board);
  let bounds = { x: 100, y: 200, width: 100, height: 140 };
  board.getBoundingClientRect = () => new DOMRect(10, 20, 800, 600);
  field.getBoundingClientRect = () => new DOMRect(10, 100, 800, 400);
  card.getBoundingClientRect = () => new DOMRect(bounds.x, bounds.y, bounds.width, bounds.height);
  const viewer = new PlayerState();
  const permanent = new Permanent();
  permanent.permanentId = "target";
  permanent.topCard = Object.assign(new CardInstance(), { instanceId: "top" });
  viewer.battleArea.push(permanent);
  const centers = { current: {} as Record<string, { x: number; y: number }> };
  const { result, rerender } = renderHook(() =>
    useBoardMeasurements({
      viewer,
      opponent: new PlayerState(),
      boardRef: { current: board },
      fieldRef: { current: field },
      permRefs: { current: { target: card } },
      permCentersRef: centers,
      permFacesRef: { current: {} },
      permCardIdsRef: { current: {} },
      opponentSecurityRef: { current: null },
    }),
  );
  result.current.spotlightRequestRef.current = { ids: ["target"], security: false };
  rerender();
  expect(centers.current.target).toEqual({ x: 140, y: 250 });
  bounds = { ...bounds, width: 130, height: 182 };
  act(() => {
    notifyResize?.([], {} as ResizeObserver);
    for (const [id, callback] of queued) {
      queued.delete(id);
      callback(0);
    }
  });
  expect(centers.current.target).toEqual({ x: 155, y: 271 });
  expect(centers.current.top).toEqual(centers.current.target);
  expect(result.current.spotlightSubjects[0]?.width).toBe(130);
  bounds = { ...bounds, x: 40 };
  act(() => {
    field.dispatchEvent(new Event("scroll"));
    for (const [id, callback] of queued) {
      queued.delete(id);
      callback(0);
    }
  });
  expect(centers.current.target?.x).toBe(95);
  expect(result.current.spotlightSubjects[0]?.x).toBe(30);
});
