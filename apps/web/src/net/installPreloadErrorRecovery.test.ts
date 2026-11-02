import { describe, expect, it, vi } from "vitest";
import { installPreloadErrorRecovery } from "@/net/installPreloadErrorRecovery";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

function setup({ readStorage }: { readStorage?: () => Storage } = {}) {
  const target = new EventTarget();
  const reload = vi.fn<() => void>();
  let clock = 1_000_000;
  const storage = memoryStorage();
  installPreloadErrorRecovery({ target, readStorage: readStorage ?? (() => storage), reload, now: () => clock });
  const fail = () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    Object.assign(event, { payload: new TypeError("Failed to fetch dynamically imported module: /assets/game.js") });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { target, reload, fail, advance: (ms: number) => (clock += ms) };
}

describe("installPreloadErrorRecovery", () => {
  it("reloads once instead of showing the error when a chunk or stylesheet fails to load", () => {
    const { reload, fail } = setup();

    expect(fail()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("lets a repeated failure surface instead of reloading in a loop", () => {
    const { reload, fail, advance } = setup();
    fail();
    advance(5_000);

    expect(fail()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again after the cooldown", () => {
    const { reload, fail, advance } = setup();
    fail();
    advance(60_000);

    expect(fail()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("waits for connectivity before reloading a failed chunk", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const storage = memoryStorage();
    let online = false;
    installPreloadErrorRecovery({ target, reload, readStorage: () => storage, isOnline: () => online });
    const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), {
      payload: new TypeError("Failed to fetch dynamically imported module: /assets/game.js"),
    });
    target.dispatchEvent(event);
    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    online = true;
    target.dispatchEvent(new Event("online"));
    expect(reload).toHaveBeenCalledTimes(1);
    target.dispatchEvent(new Event("online"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for an exception thrown while evaluating a module", () => {
    const { target, reload } = setup();
    const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), {
      payload: new RangeError("Maximum call stack size exceeded"),
    });
    target.dispatchEvent(event);
    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not reload when session storage is unavailable", () => {
    const { reload, fail } = setup({
      readStorage: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    expect(fail()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
