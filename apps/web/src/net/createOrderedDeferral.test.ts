import { afterEach, expect, it, vi } from "vitest";
import { createOrderedDeferral } from "@/net/createOrderedDeferral";

afterEach(() => {
  vi.useRealTimers();
});

it("runs deferred tasks after the current task, in the order they arrived", () => {
  vi.useFakeTimers();
  const defer = createOrderedDeferral();
  const order: string[] = [];
  defer(() => order.push("first"));
  defer(() => order.push("second"));
  expect(order).toEqual([]);
  vi.runAllTimers();
  expect(order).toEqual(["first", "second"]);
  defer(() => order.push("third"));
  vi.runAllTimers();
  expect(order).toEqual(["first", "second", "third"]);
});
