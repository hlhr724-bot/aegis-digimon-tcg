import { afterEach, expect, it, vi } from "vitest";
import { scheduleIdleTask } from "@/game/scheduleIdleTask";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("runs the task when the browser is idle, within the timeout", () => {
  const requestIdle = vi.fn<(callback: IdleRequestCallback) => number>((callback) => {
    callback({ didTimeout: false, timeRemaining: () => 10 });
    return 7;
  });
  vi.stubGlobal("requestIdleCallback", requestIdle);
  vi.stubGlobal("cancelIdleCallback", vi.fn<(handle: number) => void>());
  const task = vi.fn<() => void>();
  scheduleIdleTask(task, 120);
  expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), { timeout: 120 });
  expect(task).toHaveBeenCalledTimes(1);
});

it("falls back to the next task and can be cancelled where idle callbacks are missing", () => {
  vi.stubGlobal("requestIdleCallback", undefined);
  vi.useFakeTimers();
  const task = vi.fn<() => void>();
  const cancel = scheduleIdleTask(task, 120);
  cancel();
  vi.runAllTimers();
  expect(task).not.toHaveBeenCalled();
  scheduleIdleTask(task, 120);
  vi.runAllTimers();
  expect(task).toHaveBeenCalledTimes(1);
});
