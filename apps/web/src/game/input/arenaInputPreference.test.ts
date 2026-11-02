import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("keyboard and controller preference", () => {
  it("starts off and remembers the player's choice", async () => {
    const { arenaInputPreference } = await import("@/game/input/arenaInputPreference");
    expect(arenaInputPreference.isEnabled()).toBe(false);
    const listener = vi.fn<() => void>();
    arenaInputPreference.subscribe(listener);
    arenaInputPreference.setEnabled(true);
    expect(listener).toHaveBeenCalledOnce();
    vi.resetModules();
    const reloaded = await import("@/game/input/arenaInputPreference");
    expect(reloaded.arenaInputPreference.isEnabled()).toBe(true);
  });
});
