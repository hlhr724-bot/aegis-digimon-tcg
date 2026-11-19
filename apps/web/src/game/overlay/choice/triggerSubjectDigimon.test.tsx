import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { I18nContext } from "@/i18n/I18nContext";
import { loadDictionary } from "@/i18n/loadDictionary";
import { translator } from "@/i18n/translator";
import { DecisionTriggerChooser } from "@/game/overlay/choice/DecisionTriggerChooser";

it("shows the triggering Digimon on each pending effect of identical source cards", async () => {
  await loadDictionary("en");
  const markup = renderToStaticMarkup(
    createElement(
      I18nContext.Provider,
      { value: { locale: "en", t: translator("en"), setLocale: () => undefined } },
      createElement(DecisionTriggerChooser, {
        triggerKeys: ["first::BT26-099/watcher", "second::BT26-099/watcher", "third::BT26-099/watcher"],
        triggerCardIds: ["BT26-099", "BT26-099", "BT26-099"],
        triggerDetails: [
          { subjectCardId: "BT1-010", subjectLabel: "Triggering card: First Digimon" },
          { subjectCardId: "BT1-084", subjectLabel: "Triggering card: Second Digimon" },
          {},
        ],
        wideDialog: false,
        timing: undefined,
        triggerTimings: undefined,
        triggerDescriptions: undefined,
        triggerReasons: undefined,
        triggerIsInherited: undefined,
        triggerIsOptional: undefined,
        waitingTriggers: [],
        acceptsResolutionPlan: true,
        onRespond: () => undefined,
        onOpenBoard: () => undefined,
      }),
    ),
  );
  expect(markup).toMatch(/aria-label="[^"]*Triggering card: First Digimon/);
  expect(markup).toMatch(/aria-label="[^"]*Triggering card: Second Digimon/);
  expect(markup.match(/Triggering card: /g)).toHaveLength(4);
  expect(markup.match(/trigger-chooser__host-art/g)).toHaveLength(2);
});
