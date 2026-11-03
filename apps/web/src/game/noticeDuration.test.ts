import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageKey = "aegis.notice.duration";
let values: Map<string, string>;

beforeEach(() => {
  values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notice duration", () => {
  it("offers a short duration before the normal one", async () => {
    const { NOTICE_DURATIONS } = await import("@/game/noticeDuration");
    expect(NOTICE_DURATIONS).toEqual(["short", "normal", "long", "longest"]);
  });

  it("shortens every reading clock to a little over half at short", async () => {
    const { noticeDurationScale, setNoticeDuration } = await import("@/game/noticeDuration");
    setNoticeDuration("short");
    expect(noticeDurationScale()).toBe(0.6);
  });

  it("keeps normal as the default on a fresh device", async () => {
    const { getNoticeDuration, noticeDurationScale } = await import("@/game/noticeDuration");
    expect(getNoticeDuration()).toBe("normal");
    expect(noticeDurationScale()).toBe(1);
  });

  it("remembers the short choice after reloading", async () => {
    const { setNoticeDuration } = await import("@/game/noticeDuration");
    setNoticeDuration("short");
    expect(values.get(storageKey)).toBe("short");
    vi.resetModules();
    const reloaded = await import("@/game/noticeDuration");
    expect(reloaded.getNoticeDuration()).toBe("short");
  });

  it("keeps reading choices stored before short existed", async () => {
    values.set(storageKey, "longest");
    const { getNoticeDuration, noticeDurationScale } = await import("@/game/noticeDuration");
    expect(getNoticeDuration()).toBe("longest");
    expect(noticeDurationScale()).toBe(2);
  });

  it("falls back to normal for an unknown stored value", async () => {
    values.set(storageKey, "instant");
    const { getNoticeDuration } = await import("@/game/noticeDuration");
    expect(getNoticeDuration()).toBe("normal");
  });
});
