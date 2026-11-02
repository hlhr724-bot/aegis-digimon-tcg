// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/i18n/I18nContext";
import { translator } from "@/i18n/translator";
import * as printedCardTranslationLoader from "@/i18n/loadPrintedCardTranslations";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import * as cardTranslationLoader from "@/i18n/loadCardTranslations";
import { cardTranslationCache } from "@/i18n/cardTranslationCache";
import type { Locale } from "@/i18n/locales";
import { EffectText } from "@/game/EffectText";
import { CardLink, CardOpenerProvider } from "@/game/cardLinks";
import { PermanentKeywordBadges } from "@/game/piece/PermanentKeywordBadges";
import { CardZoomPreview } from "@/design/CardZoomPreview";
import { ArenaInspectorSourceEffect } from "@/game/ArenaInspectorSourceEffect";
import { ArenaInspectorSourcesStrip } from "@/game/ArenaInspectorSourcesStrip";
import { CardFull, CardMini } from "./cards";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("renders the Chinese resolving clause with card context after printed translations load", async () => {
  const card = getCardDefinition("LM-034")!;
  const clause = card.effectText!.split("\n")[1]!;
  const { container } = render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <EffectText text={clause} cardId={card.cardId} />
    </I18nContext.Provider>,
  );
  await waitFor(() => expect(container.textContent).toContain("将其中的1张蓝色/红色数码宝贝卡牌加入手牌"));
  expect(container.textContent).not.toContain("Reveal");
  expect(container.textContent).not.toContain("内存值");
  expect(container.querySelector('mark[data-kind="timing"]')?.textContent).toBe("[主要]");
});

describe("CardMini orientation", () => {
  it("turns a suspended permanent sideways so the state is unambiguous", () => {
    render(<CardMini cardId="ST1-02" suspended zoomOnHover={false} />);

    const card = screen.getByTitle("Biyomon");
    expect(card.dataset.state).toBe("suspended");
    expect(card.style.rotate).toBe("90deg");
    expect(card.style.transformOrigin).toBe("center");
  });
});

// The arena uses pointer gestures even while play is gated between phases.
it.each([CardFull, CardMini])("#5394: artwork cannot start a browser-native image drag", (Card) => {
  render(<Card cardId="ST1-02" zoomOnHover={false} />);
  expect((screen.getByRole("img") as HTMLImageElement).draggable).toBe(false);
});

describe("CardMini board DP", () => {
  it("scales the DP total twice as steeply as ordinary text", () => {
    render(<CardMini cardId="ST1-02" width={92} dp={3000} info zoomOnHover={false} />);

    expect(screen.getByText("3K").style.fontSize).toBe("calc(13px * calc(1 + (var(--ds-text-scale, 1) - 1) * 2))");
  });
});

describe("CardMini cost badge", () => {
  it("marks a DUAL card as DUAL instead of showing its use cost as a play cost", () => {
    const { container } = render(<CardMini cardId="BT27-070" width={92} info zoomOnHover={false} />);
    expect(container.querySelector('[data-cost="play"]')).toBeNull();
    expect(container.querySelector('[data-card-kind="dual"]')?.textContent).toBe("DUAL");
  });

  it("keeps the play cost badge on a Digimon card", () => {
    const { container } = render(<CardMini cardId="ST1-02" width={92} info zoomOnHover={false} />);
    expect(container.querySelector('[data-card-kind="dual"]')).toBeNull();
    expect(container.querySelector('[data-cost="play"]')?.textContent).toBe(
      String(getCardDefinition("ST1-02")!.playCost),
    );
  });
});

describe("CardMini board info", () => {
  it.each(["ST23-13", "ST23-02", "BT18-102", "BT16-102"])(
    "shows the name without printed forms, attributes or types for %s",
    (cardId) => {
      const { container } = render(<CardMini cardId={cardId} width={116} info zoomOnHover={false} />);

      expect(screen.getByText(getCardDefinition(cardId)!.nameEn)).toBeTruthy();
      expect(container.textContent).not.toContain(" · ");
    },
  );
});

it("loads Chinese card data on locale selection and restores the upstream locale on switching", async () => {
  cardTranslationCache.data = undefined;
  cardTranslationCache.pending = undefined;
  cardTranslationCache.printedData = undefined;
  cardTranslationCache.printedPending = undefined;
  function LocalizedCard({ locale }: { locale: Locale }) {
    return (
      <I18nContext.Provider value={{ locale, t: translator(locale), setLocale: () => undefined }}>
        <CardMini cardId="ST1-02" info zoomOnHover={false} />
        <CardLink cardId="ST1-02" />
        <EffectText text="End of Your Turn" />
        <PermanentKeywordBadges
          keywords={[{ keyword: "Reboot", label: "Reboot" }]}
          securityAttackModifier={0}
          cardWidth={100}
        />
      </I18nContext.Provider>
    );
  }
  const { rerender, container } = render(<LocalizedCard locale="en" />);
  expect(screen.getByTitle("Biyomon")).toBeTruthy();
  expect(cardTranslationCache.pending).toBeUndefined();
  rerender(<LocalizedCard locale="zh-CN" />);
  expect(await screen.findByTitle("比丘兽")).toBeTruthy();
  await waitFor(() => expect(container.querySelector(".card-effect-text")?.textContent).toBe("我方的回合结束时"));
  expect(container.querySelector(".game-keyword-badges")?.textContent).toBe("重启");
  expect(screen.getAllByText("比丘兽").length).toBeGreaterThan(0);
  rerender(<LocalizedCard locale="zh-TW" />);
  expect(screen.getByTitle("Biyomon")).toBeTruthy();
  expect(container.querySelector(".card-effect-text")?.textContent).toBe("End of Your Turn");
  expect(container.querySelector(".game-keyword-badges")?.textContent).toBe("Reboot");
});

it("loads card names without loading the printed-text dictionary", async () => {
  cardTranslationCache.data = undefined;
  cardTranslationCache.pending = undefined;
  cardTranslationCache.printedData = undefined;
  cardTranslationCache.printedPending = undefined;
  render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <CardMini cardId="ST1-02" zoomOnHover={false} />
      <CardOpenerProvider onOpenCard={() => undefined}>
        <CardLink cardId="ST1-02" label="Biyomon" />
      </CardOpenerProvider>
    </I18nContext.Provider>,
  );
  expect(await screen.findByTitle("比丘兽")).toBeTruthy();
  expect(screen.getByText("Biyomon (ST1-02)").closest("button")).toBeTruthy();
  expect(cardTranslationCache.printedPending).toBeUndefined();
});

it("localizes the extracted card preview and inspector source views", async () => {
  cardTranslationCache.data = undefined;
  cardTranslationCache.pending = undefined;
  cardTranslationCache.printedData = undefined;
  cardTranslationCache.printedPending = undefined;
  const card = { cardId: "ST1-02", role: "stack" as const };
  render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <CardZoomPreview cardId="ST1-02" x={100} y={100} fallbackIndex={0} />
      <ArenaInspectorSourceEffect card={card} onZoom={() => undefined} showThumbnail />
      <ArenaInspectorSourcesStrip cards={[card]} onZoom={() => undefined} />
    </I18nContext.Provider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId("card-zoom-preview").querySelector("img")?.alt).toBe("比丘兽");
    expect(screen.getByRole("group").querySelector("button")?.getAttribute("aria-label")).toBe("比丘兽");
    expect(screen.getAllByText("比丘兽", { exact: false }).length).toBeGreaterThan(0);
  });
});

it("keeps the signed modifier and rule link in a Chinese printed keyword hint", async () => {
  const { container } = render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <EffectText text="＜安防攻击-2＞" />
    </I18nContext.Provider>,
  );
  const badge = await waitFor(() => {
    const node = container.querySelector("[data-badge-hint]");
    expect(node).toBeTruthy();
    return node!;
  });
  fireEvent.click(badge);
  expect(await screen.findByText("此数码宝贝进行安防判定的张数减少2张。")).toBeTruthy();
  expect(screen.getByRole("link").getAttribute("href")).toBe("https://world.digimoncard.com/rule/pdf/general_rule.pdf");
});

it("falls back after a failed dictionary load and retries on a later locale selection", async () => {
  cardTranslationCache.data = undefined;
  cardTranslationCache.pending = undefined;
  const load = vi
    .spyOn(cardTranslationLoader, "loadCardTranslations")
    .mockRejectedValueOnce(new Error("Network unavailable"));
  function LocalizedName({ locale }: { locale: Locale }) {
    return (
      <I18nContext.Provider value={{ locale, t: translator(locale), setLocale: () => undefined }}>
        <CardMini cardId="ST1-02" zoomOnHover={false} />
      </I18nContext.Provider>
    );
  }
  const { rerender } = render(<LocalizedName locale="zh-CN" />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  expect(screen.getByTitle("Biyomon")).toBeTruthy();
  rerender(<LocalizedName locale="en" />);
  rerender(<LocalizedName locale="zh-CN" />);
  expect(await screen.findByTitle("比丘兽")).toBeTruthy();
});

it("retains a Partition hint when ASCII display contains a nested Chinese condition", async () => {
  const { container } = render(
    <I18nContext.Provider value={{ locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined }}>
      <EffectText text="＜分裂<蓝色Lv.4&绿色Lv.4>＞" asciiBrackets />
    </I18nContext.Provider>,
  );
  const badge = await waitFor(() => {
    const node = container.querySelector("[data-badge-hint]");
    expect(node?.textContent).toBe("<分裂<蓝色Lv.4&绿色Lv.4>>");
    return node!;
  });
  fireEvent.click(badge);
  expect(screen.getByRole("link").textContent).toContain("16-");
});

it("keeps translated names available when printed-text loading fails and recovers on reselection", async () => {
  cardTranslationCache.data = undefined;
  cardTranslationCache.pending = undefined;
  cardTranslationCache.printedData = undefined;
  cardTranslationCache.printedPending = undefined;
  const text = getCardDefinition("ST1-03")!.inheritedEffectText!;
  const load = vi
    .spyOn(printedCardTranslationLoader, "loadPrintedCardTranslations")
    .mockRejectedValueOnce(new Error("Printed-text request failed"));
  function LocalizedCard({ locale }: { locale: Locale }) {
    return (
      <I18nContext.Provider value={{ locale, t: translator(locale), setLocale: () => undefined }}>
        <CardMini cardId="ST1-02" zoomOnHover={false} />
        <EffectText text={text} />
      </I18nContext.Provider>
    );
  }
  const { container, rerender } = render(<LocalizedCard locale="zh-CN" />);
  expect(await screen.findByTitle("比丘兽")).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
  expect(container.querySelector(".card-effect-text")?.textContent).toBe(text);
  rerender(<LocalizedCard locale="en" />);
  rerender(<LocalizedCard locale="zh-CN" />);
  await waitFor(() =>
    expect(container.querySelector(".card-effect-text")?.textContent).toContain("此数码宝贝的DP+1000。"),
  );
  expect(screen.getByTitle("比丘兽")).toBeTruthy();
});

it.each([
  [1000, "+1K", "up"],
  [-1000, "−1K", "down"],
])("glues delta %s to the total with its direction", (delta, label, direction) => {
  render(<CardMini cardId="ST1-02" width={116} dp={4000} dpDelta={Number(delta)} info zoomOnHover={false} />);
  const bonus = screen.getByText(String(label));
  expect(bonus.dataset.dp).toBe(direction);
  expect(bonus.parentElement?.textContent).toBe(`4K${label}`);
  expect(bonus.closest("[data-dp-layout]")?.getAttribute("data-dp-layout")).toBe("stacked");
});

it.each([undefined, 0])("shows only the total for unchanged DP %s on wide cards", (delta) => {
  const { container } = render(
    <CardMini cardId="ST1-02" width={116} dp={4000} dpDelta={delta} info zoomOnHover={false} />,
  );
  expect(screen.getByText("4K")).toBeTruthy();
  expect(container.querySelector("[data-dp]")).toBeNull();
  expect(container.querySelector("[data-dp-layout]")).toBeNull();
});

it("stacks compact live DP but preserves link card geometry", () => {
  const view = render(<CardMini cardId="ST1-02" width={76} dp={4000} info zoomOnHover={false} />);
  expect(view.container.querySelector('[data-dp-layout="stacked"]')).toBeTruthy();
  view.rerender(<CardMini cardId="ST1-02" width={76} info zoomOnHover={false} />);
  expect(view.container.querySelector("[data-dp-layout]")).toBeNull();
});

it("lets the caller wrap the bonus", () => {
  render(
    <CardMini
      cardId="ST1-02"
      dp={4000}
      dpDelta={1000}
      info
      zoomOnHover={false}
      renderDpDelta={(node) => <span title="DP explanation">{node}</span>}
    />,
  );
  expect(screen.getByTitle("DP explanation").textContent).toBe("+1K");
});

it("caps non-round DP so the total and bonus fit the card", () => {
  render(<CardMini cardId="ST1-02" width={116} dp={12500} dpDelta={500} info zoomOnHover={false} />);
  expect(screen.getByText((12500).toLocaleString()).style.fontSize).toMatch(/^min\(calc\(16px/);
  expect(screen.getByText("+500").parentElement?.textContent).toBe(`${(12500).toLocaleString()}+500`);
});

it("keeps a selected face-down mini card concealed while showing the selection rim", () => {
  const { container, rerender } = render(<CardMini cardId="ST1-02" faceDown selected zoomOnHover={false} />);
  const back = container.firstElementChild;
  expect(back).toBeInstanceOf(HTMLElement);
  expect(back?.getAttribute("style")).toContain("--ds-rim-attention");
  expect(screen.queryByTitle("Biyomon")).toBeNull();
  const concealedMarkup = back!.innerHTML;
  rerender(<CardMini cardId="ST1-02" faceDown zoomOnHover={false} />);
  expect(back?.getAttribute("style")).not.toContain("--ds-rim-attention");
  expect(back!.innerHTML).toBe(concealedMarkup);
});
