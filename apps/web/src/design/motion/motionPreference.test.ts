import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MotionMode } from "@/design/motion/MotionMode";
import { MOTION_ATTRIBUTE } from "@/design/motion/motionAttribute";

const STORAGE_KEY = "aegis.motion";

type SystemMotion = {
  reduced: boolean;
  listeners: Set<() => void>;
};

const systemMotion: SystemMotion = { reduced: false, listeners: new Set() };

function changeSystemMotion(reduced: boolean) {
  systemMotion.reduced = reduced;
  for (const listener of systemMotion.listeners) {
    listener();
  }
}

async function loadPreference() {
  vi.resetModules();
  const module = await import("@/design/motion/motionPreference");
  return module.motionPreference;
}

beforeEach(() => {
  localStorage.clear();
  systemMotion.reduced = false;
  systemMotion.listeners.clear();
  document.documentElement.removeAttribute(MOTION_ATTRIBUTE);
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" && systemMotion.reduced;
    },
    addEventListener: (_type: string, listener: () => void) => systemMotion.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => systemMotion.listeners.delete(listener),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("follows the device by default", async () => {
  const preference = await loadPreference();
  expect(preference.getMode()).toBe(MotionMode.SYSTEM.value);
  preference.apply();
  expect(document.documentElement.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionMode.FULL.value);
  changeSystemMotion(true);
  expect(preference.isReduced()).toBe(true);
  expect(document.documentElement.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionMode.REDUCED.value);
});

it("animates when the player overrides a device that asks for reduced motion", async () => {
  systemMotion.reduced = true;
  const preference = await loadPreference();
  preference.apply();
  preference.setMode(MotionMode.FULL.value);
  expect(preference.isReduced()).toBe(false);
  expect(document.documentElement.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionMode.FULL.value);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(MotionMode.FULL.value);
  expect((await loadPreference()).getMode()).toBe(MotionMode.FULL.value);
});

it("reduces motion when the player asks, whatever the device says", async () => {
  const preference = await loadPreference();
  preference.setMode(MotionMode.REDUCED.value);
  expect(preference.isReduced()).toBe(true);
  expect(document.documentElement.getAttribute(MOTION_ATTRIBUTE)).toBe(MotionMode.REDUCED.value);
});

it("notifies subscribers when the player or the device changes motion", async () => {
  const preference = await loadPreference();
  const listener = vi.fn<() => void>();
  const unsubscribe = preference.subscribe(listener);
  preference.setMode(MotionMode.REDUCED.value);
  preference.setMode(MotionMode.SYSTEM.value);
  changeSystemMotion(true);
  expect(listener).toHaveBeenCalledTimes(3);
  unsubscribe();
  changeSystemMotion(false);
  expect(listener).toHaveBeenCalledTimes(3);
});

it.each(["invalid", "constructor"])("ignores an unknown saved mode: %s", async (stored) => {
  localStorage.setItem(STORAGE_KEY, stored);
  expect((await loadPreference()).getMode()).toBe(MotionMode.SYSTEM.value);
});

it("stays usable when storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  const preference = await loadPreference();
  expect(preference.getMode()).toBe(MotionMode.SYSTEM.value);
  preference.setMode(MotionMode.REDUCED.value);
  expect(preference.isReduced()).toBe(true);
});
