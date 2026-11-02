import { afterEach, beforeEach, expect, it, vi } from "vitest";

let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.resetModules();
});

afterEach(() => vi.unstubAllGlobals());

it("remembers valid appearance choices across reloads and restores the original defaults", async () => {
  const { arenaAppearancePreference } = await import("@/design/arenaAppearance/arenaAppearancePreference");
  expect(arenaAppearancePreference.getAppearance()).toEqual({ scale: "default", transparency: "opaque" });
  arenaAppearancePreference.setAppearance({ scale: "larger", transparency: "clear" });
  vi.resetModules();
  const reloaded = await import("@/design/arenaAppearance/arenaAppearancePreference");
  expect(reloaded.arenaAppearancePreference.getAppearance()).toEqual({ scale: "larger", transparency: "clear" });
  reloaded.arenaAppearancePreference.resetAppearance();
  expect(JSON.parse(values.get("aegis.arena-appearance")!)).toEqual({ scale: "default", transparency: "opaque" });
});

it.each(["not json", JSON.stringify({ scale: "constructor", transparency: "__proto__" }), "42", "null"])(
  "falls back safely for malformed persisted appearance %s",
  async (stored) => {
    values.set("aegis.arena-appearance", stored);
    const { arenaAppearancePreference } = await import("@/design/arenaAppearance/arenaAppearancePreference");
    expect(arenaAppearancePreference.getAppearance()).toEqual({ scale: "default", transparency: "opaque" });
  },
);

it("applies preferences in memory when device storage is blocked", async () => {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  });
  const { arenaAppearancePreference } = await import("@/design/arenaAppearance/arenaAppearancePreference");
  arenaAppearancePreference.setAppearance({ scale: "large", transparency: "subtle" });
  expect(arenaAppearancePreference.getAppearance()).toEqual({ scale: "large", transparency: "subtle" });
});
