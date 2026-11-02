import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { I18nContext } from "@/i18n/I18nContext";
import { loadDictionary } from "@/i18n/loadDictionary";
import { loadPrintedCardTranslations } from "@/i18n/loadPrintedCardTranslations";
import { translator } from "@/i18n/translator";
import { DecisionTriggerChooser } from "@/game/overlay/choice/DecisionTriggerChooser";

async function renderTriggerChooser(locale: "zh-CN" | "en") {
  await loadDictionary(locale);
  await loadPrintedCardTranslations();
  const reason = "When your security stack is removed from";
  return renderToStaticMarkup(
    createElement(
      I18nContext.Provider,
      { value: { locale, t: translator(locale), setLocale: () => undefined } },
      createElement(DecisionTriggerChooser, {
        triggerKeys: ["source::BT15-037/discard", "other::BT27-043/watcher"],
        triggerCardIds: ["BT15-037", "BT27-043"],
        triggerDetails: [],
        wideDialog: false,
        timing: undefined,
        triggerTimings: ["OnDiscardSecurity", "AllTurns"],
        triggerDescriptions: undefined,
        triggerReasons: ["", reason],
        triggerIsInherited: undefined,
        triggerIsOptional: undefined,
        waitingTriggers: [],
        acceptsResolutionPlan: false,
        onRespond: () => undefined,
        onOpenBoard: () => undefined,
      }),
    ),
  );
}

it("localizes trigger bodies, reasons and accessible names in Chinese", async () => {
  const markup = await renderTriggerChooser("zh-CN");
  expect(markup).toContain("触发原因：当我方的安防卡牌减少时");
  expect(markup).toMatch(/aria-label="[^"]*当我方的安防卡牌减少时/);
  expect(markup).toContain("不支付费用登场");
  expect(markup).not.toContain("When your security stack is removed from");
  expect(markup).not.toContain("When an effect trashes this card");
});

it("preserves English trigger bodies and reasons", async () => {
  const markup = await renderTriggerChooser("en");
  expect(markup).toContain("When your security stack is removed from");
  expect(markup).toContain("When an effect trashes this card");
});
