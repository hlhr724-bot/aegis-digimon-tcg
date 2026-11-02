import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageKey = "aegis.notice.size";
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

describe("notice size preference", () => {
  it("starts at normal size on a fresh device", async () => {
    const { noticeSizePreference } = await import("@/game/noticeSize/noticeSizePreference");
    expect(noticeSizePreference.get()).toBe("normal");
  });

  it("notifies listeners and remembers compact after reloading", async () => {
    const { noticeSizePreference } = await import("@/game/noticeSize/noticeSizePreference");
    const listener = vi.fn<() => void>();
    noticeSizePreference.subscribe(listener);
    noticeSizePreference.set("compact");
    expect(listener).toHaveBeenCalledOnce();
    expect(values.get(storageKey)).toBe("compact");
    vi.resetModules();
    const reloaded = await import("@/game/noticeSize/noticeSizePreference");
    expect(reloaded.noticeSizePreference.get()).toBe("compact");
  });

  it("falls back to normal for an unknown stored value", async () => {
    values.set(storageKey, "constructor");
    const { noticeSizePreference } = await import("@/game/noticeSize/noticeSizePreference");
    expect(noticeSizePreference.get()).toBe("normal");
  });

  it("keeps the session choice when storage refuses the write", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const { noticeSizePreference } = await import("@/game/noticeSize/noticeSizePreference");
    noticeSizePreference.set("compact");
    expect(noticeSizePreference.get()).toBe("compact");
  });
});

describe("notice size values", () => {
  it("accepts only the defined sizes", async () => {
    const { isNoticeSize } = await import("@/game/noticeSize/isNoticeSize");
    expect(isNoticeSize("normal")).toBe(true);
    expect(isNoticeSize("compact")).toBe(true);
    expect(isNoticeSize("constructor")).toBe(false);
    expect(isNoticeSize(0.75)).toBe(false);
    expect(isNoticeSize(null)).toBe(false);
  });

  it("shrinks geometry more than text so a compact clause stays readable", async () => {
    const { NoticeSize } = await import("@/game/noticeSize/NoticeSize");
    expect(NoticeSize.NORMAL.scale).toBe(1);
    expect(NoticeSize.COMPACT.scale).toBeLessThan(NoticeSize.COMPACT.textScale);
    expect(NoticeSize.COMPACT.textScale).toBeLessThan(1);
  });
});
