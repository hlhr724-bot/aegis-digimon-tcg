import { PlayChoicePrompts } from "@/game/screen/layout/PlayChoicePrompts";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nContext } from "@/i18n/I18nContext";
import { loadDictionary } from "@/i18n/loadDictionary";
import { loadCardTranslations } from "@/i18n/loadCardTranslations";
import { translator } from "@/i18n/translator";
import { PrintedCardInfo } from "@/game/overlay/viewer/PrintedCardInfo";
import { ZoneShowcase } from "@/game/ZoneShowcase";
import { ActionBar } from "@/game/screen/layout/ActionBar";
import { DeckGuideCardChip } from "@/screens/community/DeckGuideCardChip";
import { BlockOverlay } from "@/game/overlay/combat/BlockOverlay";
import { DecisionEffectChoice } from "@/game/overlay/choice/DecisionEffectChoice";
import { ProviderCardGallery } from "@/deckProviders/ProviderCardGallery";
import type { Locale } from "@/i18n/locales";
import { CardLinkedText, CardOpenerProvider } from "@/game/cardLinks";
import { tokenDefinitions } from "@aegis/shared/cards/tokens";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { DecisionTriggerChooser } from "@/game/overlay/choice/DecisionTriggerChooser";
import { PermanentDetailInspector } from "@/game/overlay/viewer/PermanentDetailInspector";
import { buildPermanentDetail } from "@/game/permanentDetail";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { Permanent } from "@aegis/shared/schema/Permanent";
import { triggerLabels } from "@/game/boardModel";
import { forcedAttackGrantText } from "@/game/fieldBadges";
import { violationMessage } from "@/tournaments/labels";

type Probe = { name: string; render: () => ReactElement; target: RegExp };

it.each(["ACE", " ACE", "ＡＣＥ", "ace "])("removes an imported %s suffix from shared names", async (suffix) => {
  const translations = {
    ...(await loadCardTranslations("zh-CN")),
    names: { Susanoomon: `须佐之男兽${suffix}`, "Susanoomon ACE": "须佐之男兽 ACE" },
  };
  expect(getTranslatedCardName({ name: "Susanoomon", translations })).toBe("须佐之男兽");
  expect(getTranslatedCardName({ name: "Unknown", translations })).toBe("Unknown");
  expect(getTranslatedCardName({ name: "Susanoomon ACE", translations })).toBe("须佐之男兽 ACE");
});

it.each(["zh-CN", "ja", "ko"] as const)("keeps ACE classification out of shared %s card names", async (locale) => {
  const translations = await loadCardTranslations(locale);
  const unexpected = Object.entries(translations.names).filter(
    ([name, translated]) => !/(?:ACE|ＡＣＥ)\s*$/iu.test(name) && /(?:ACE|ＡＣＥ)\s*$/iu.test(translated),
  );
  expect(unexpected).toEqual([]);
});

const probes: Probe[] = [
  {
    name: "trigger order",
    render: () =>
      createElement(DecisionTriggerChooser, {
        triggerKeys: ["source::ST18-05/on-play"],
        triggerCardIds: ["ST18-05"],
        triggerDetails: [],
        wideDialog: false,
        timing: undefined,
        triggerTimings: undefined,
        triggerDescriptions: undefined,
        triggerReasons: undefined,
        triggerIsInherited: undefined,
        triggerIsOptional: undefined,
        waitingTriggers: [],
        acceptsResolutionPlan: false,
        onRespond: () => undefined,
        onOpenBoard: () => undefined,
      }),
    target: /<span\b[^>]*class="trigger-chooser__name"[^>]*>(.*?)<\/span>/,
  },
  {
    name: "legacy permanent inspector",
    render: () => {
      const permanent = new Permanent();
      permanent.topCard = Object.assign(new CardInstance(), { cardId: "ST18-05", instanceId: "source" });
      return createElement(PermanentDetailInspector, {
        detail: buildPermanentDetail(permanent),
        anchorX: 0,
        anchorY: 0,
        inline: true,
      });
    },
    target: /<strong[^>]*>(.*?)<\/strong>/,
  },
  {
    name: "card details",
    render: () => createElement(PrintedCardInfo, { cardId: "ST18-05" }),
    target: /<strong[^>]*>(.*?)<\/strong>/,
  },
  {
    name: "arrival caption",
    render: () =>
      createElement(ZoneShowcase, {
        showcase: { key: 1, cardId: "ST18-05", kind: "play", mine: true, color: "Green", seat: 0 },
      }),
    target: /<figcaption[^>]*>(.*?)<\/figcaption>/,
  },
  {
    name: "link action",
    render: () => createElement(ActionBar, { linkingCardId: "ST18-05", hasBase: false, onCancel: () => undefined }),
    target: /<strong[^>]*>(.*?)<\/strong>/,
  },
  {
    name: "guide card",
    render: () => createElement(DeckGuideCardChip, { cardId: "ST18-05" }),
    target: /<a\b[^>]*>(.*?)<\/a>/,
  },
  {
    name: "blocker choice",
    render: () =>
      createElement(BlockOverlay, {
        attackerCardId: "ST18-05",
        blockers: [{ permanentId: "blocker", cardId: "ST18-05", currentDP: 3000, sourceCount: 0 }],
        onBlock: () => undefined,
        onDecline: () => undefined,
      }),
    target: /<strong[^>]*>(.*?)<\/strong>/,
  },
  {
    name: "effect choice",
    render: () =>
      createElement(DecisionEffectChoice, {
        choices: ["[On Play]"],
        choiceEffects: [{ cardId: "ST18-05", timing: "OnPlay" }],
        wideDialog: false,
        onRespond: () => undefined,
        onOpenBoard: () => undefined,
      }),
    target: /<span\b[^>]*class="effect-choice__name"[^>]*>(.*?)<\/span>/,
  },
  {
    name: "provider gallery",
    render: () => createElement(ProviderCardGallery, { title: "Cards", cards: ["ST18-05"] }),
    target: /<strong[^>]*>(.*?)<\/strong>/,
  },
];

describe.each(["zh-CN", "en"] as const)("%s card name displays", (locale: Locale) => {
  it.each(probes)("uses the selected language for $name", async ({ render, target }) => {
    await loadDictionary(locale);
    await loadCardTranslations("zh-CN");
    const markup = renderToStaticMarkup(
      createElement(
        I18nContext.Provider,
        { value: { locale, t: translator(locale), setLocale: () => undefined } },
        render(),
      ),
    );
    const text = markup.match(target)?.[1]?.replace(/<[^>]+>/g, "");
    expect(text).toContain(locale === "zh-CN" ? "五彩兽" : "Muchomon");
  });
});

it.each([false, true])("translates a linked sentence with card opener availability %s", async (openable) => {
  await loadDictionary("zh-CN");
  await loadCardTranslations("zh-CN");
  const sentence = createElement(CardLinkedText, { text: "Muchomon ×3", cardIds: ["ST18-05"] });
  const content = openable
    ? createElement(CardOpenerProvider, { onOpenCard: () => undefined, children: sentence })
    : sentence;
  const markup = renderToStaticMarkup(
    createElement(
      I18nContext.Provider,
      { value: { locale: "zh-CN", t: translator("zh-CN"), setLocale: () => undefined } },
      content,
    ),
  );
  expect(markup).toContain("五彩兽");
  expect(markup).toContain("×3");
  expect(markup).not.toContain("Muchomon");
  expect(markup.includes("<button")).toBe(openable);
});

it("covers synthetic token names as well as printed catalog card names", async () => {
  const translations = await loadCardTranslations("zh-CN");
  const missing = tokenDefinitions.filter(
    (card) => getTranslatedCardName({ name: card.nameEn, translations }) === card.nameEn,
  );
  expect(missing.map((card) => card.cardId)).toEqual([]);
});

it("keeps trigger copy identities when display names are translated", async () => {
  await loadDictionary("zh-CN");
  const t = translator("zh-CN");
  const labels = triggerLabels(["first::ST18-05/play", "second::ST18-05/play"], t, [], () => "五彩兽");
  expect(labels).toEqual([
    t("log.copySuffix", { label: "五彩兽", n: 1 }),
    t("log.copySuffix", { label: "五彩兽", n: 2 }),
  ]);
  expect(triggerLabels(["first::ST18-05/play", "second::ST18-04/play"], t, [], () => "相同译名")).toEqual([
    "相同译名",
    "相同译名",
  ]);
});

it("translates indirect violation and granted-effect card names without rewriting source clauses", async () => {
  await loadDictionary("zh-CN");
  const translations = await loadCardTranslations("zh-CN");
  const t = translator("zh-CN");
  const getName = (cardId: string) => (cardId === "ST18-05" ? "五彩兽" : "劲力三叉爪");
  const violation = violationMessage({ kind: "banned_pair", cardId: "ST18-05", conflictsWith: "ST15-16" }, getName);
  expect(violation.params).toEqual({ card: "五彩兽", other: "劲力三叉爪" });
  const clause = "[Start of Your Main Phase] This Digimon attacks.";
  const grant = forcedAttackGrantText({ clause, sourceCardId: "ST15-16" }, t, getName);
  expect(grant).toContain("劲力三叉爪");
  expect(grant).toContain(clause);
  expect(grant).not.toContain("Trident Arm");
  expect(getTranslatedCardName({ name: "Trident Arm", translations })).toBe("劲力三叉爪");
});

it.each(["zh-CN", "en"] as const)("translates both card names in a %s evolution confirmation", async (locale) => {
  await loadDictionary(locale);
  await loadCardTranslations("zh-CN");
  const ignore = () => undefined;
  const markup = renderToStaticMarkup(
    createElement(
      I18nContext.Provider,
      {
        value: { locale, t: translator(locale), setLocale: ignore },
      },
      createElement(PlayChoicePrompts, {
        dualPlay: null,
        actionConfirm: {
          kind: "digivolve",
          instanceId: "evolution",
          cardId: "ST18-05",
          permanentId: "base",
          baseCardId: "ST18-04",
        },
        actionBlocked: false,
        dnaRoutes: [],
        dnaPermanents: [],
        dnaPickedPermanentIds: [],
        appFusion: null,
        evoCostChoice: null,
        memory: 0,
        assemblyPick: null,
        digiXrosPick: null,
        onDualPlay: ignore,
        onDualPlayCancel: ignore,
        onConfirmAction: ignore,
        onDigivolveNormally: undefined,
        onConfirmCancel: ignore,
        onPlayNormally: ignore,
        canPlayNormally: false,
        onAppFusion: ignore,
        onAppFusionNormalEvolution: undefined,
        onAppFusionCancel: ignore,
        onEvoCost: ignore,
        onEvoCostCancel: ignore,
        onAssembly: ignore,
        onAssemblySkip: ignore,
        onAssemblyCancel: ignore,
        onDigiXros: ignore,
        onDigiXrosSkip: ignore,
        onDigiXrosCancel: ignore,
      }),
    ),
  );
  const text = markup.replace(/<[^>]+>/g, "");
  expect(text).toContain(locale === "zh-CN" ? "五彩兽" : "Muchomon");
  expect(text).toContain(locale === "zh-CN" ? "飞翼兽" : "Pteromon");
  if (locale === "zh-CN") {
    expect(text).not.toContain("Muchomon");
    expect(text).not.toContain("Pteromon");
  }
});
