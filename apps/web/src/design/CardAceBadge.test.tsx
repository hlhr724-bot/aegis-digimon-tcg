import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { allCards, getCardDefinition } from "@aegis/shared/cards/registry";
import { CardAceBadge } from "@/design/CardAceBadge";
import { PrintedCardInfo } from "@/game/overlay/viewer/PrintedCardInfo";
import { I18nContext } from "@/i18n/I18nContext";
import { translator } from "@/i18n/translator";

it("identifies every ACE by card metadata while preserving same-named ordinary cards", () => {
  const aceCards = allCards().filter((card) => card.isAce || (card.overflowMemory ?? 0) > 0);
  expect(aceCards.length).toBeGreaterThan(80);
  for (const card of allCards()) {
    const badge = renderToStaticMarkup(createElement(CardAceBadge, { cardId: card.cardId }));
    expect(Boolean(badge)).toBe(Boolean(card.isAce || (card.overflowMemory ?? 0) > 0));
  }
  expect(getCardDefinition("BT17-018")!.nameEn).toBe(getCardDefinition("EX2-073")!.nameEn);
  const wrap = (cardId: string) =>
    createElement(
      I18nContext.Provider,
      { value: { locale: "en", t: translator("en"), setLocale: () => undefined } },
      createElement(PrintedCardInfo, { cardId }),
    );
  expect(renderToStaticMarkup(wrap("BT17-018"))).toContain('aria-label="ACE"');
  expect(renderToStaticMarkup(wrap("EX2-073"))).not.toContain('aria-label="ACE"');
});
