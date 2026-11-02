import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCardTranslationState } from "@/i18n/useCardTranslationState";
import { getCardTranslationCache } from "@/i18n/getCardTranslationCache";
import * as loader from "@/i18n/loadPrintedCardTranslations";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import type { Locale } from "@/i18n/locales";

const data: CardTranslationData = {
  names: {},
  text: { printed: "中文" },
  keywords: {},
  reminders: {},
  meta: { forms: {}, attributes: {}, traits: {} },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("reports a printed load error and retries only when explicitly requested", async () => {
  const cache = getCardTranslationCache("zh-CN")!;
  const previous = { ...cache };
  cache.printedData = undefined;
  try {
    const load = vi
      .spyOn(loader, "loadPrintedCardTranslations")
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(data);
    const { result } = renderHook(() => useCardTranslationState({ locale: "zh-CN", includePrintedText: true }));
    expect(result.current.status).toBe("pending");
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBeUndefined();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("complete"));
    expect(result.current.data).toBe(data);
    expect(load).toHaveBeenCalledTimes(2);
  } finally {
    Object.assign(cache, previous);
  }
});

it("discards an old language response when a newer language has loaded", async () => {
  const ja = getCardTranslationCache("ja")!;
  const ko = getCardTranslationCache("ko")!;
  const previousJa = { ...ja };
  const previousKo = { ...ko };
  ja.printedData = undefined;
  ko.printedData = undefined;
  try {
    let resolveJapanese!: (value: CardTranslationData) => void;
    const japanese = new Promise<CardTranslationData>((resolve) => {
      resolveJapanese = resolve;
    });
    const korean = { ...data, text: { printed: "한국어" } };
    vi.spyOn(loader, "loadPrintedCardTranslations").mockImplementation((locale) =>
      locale === "ja" ? japanese : Promise.resolve(korean),
    );
    const { result, rerender } = renderHook(
      ({ locale }: { locale: Locale }) => useCardTranslationState({ locale, includePrintedText: true }),
      { initialProps: { locale: "ja" as Locale } },
    );
    rerender({ locale: "ko" });
    await waitFor(() => expect(result.current.data).toBe(korean));
    await act(async () => {
      resolveJapanese(data);
      await japanese;
    });
    expect(result.current.locale).toBe("ko");
    expect(result.current.data).toBe(korean);
  } finally {
    Object.assign(ja, previousJa);
    Object.assign(ko, previousKo);
  }
});
