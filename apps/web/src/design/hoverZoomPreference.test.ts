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

describe("hover zoom preference", () => {
  it("starts off and remembers the player's choice", async () => {
    const { hoverZoomPreference } = await import("@/design/hoverZoomPreference");
    expect(hoverZoomPreference.isEnabled()).toBe(false);
    const listener = vi.fn<() => void>();
    hoverZoomPreference.subscribe(listener);
    hoverZoomPreference.setEnabled(true);
    expect(listener).toHaveBeenCalledOnce();
    vi.resetModules();
    const reloaded = await import("@/design/hoverZoomPreference");
    expect(reloaded.hoverZoomPreference.isEnabled()).toBe(true);
  });
});
