import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import type { Locale } from "@/i18n/locales";
import { detectChatLanguage } from "@/game/chat/translation/detectChatLanguage";
import { getBrowserTranslationApi } from "@/game/chat/translation/getBrowserTranslationApi";
import { translateChatText } from "@/game/chat/translation/translateChatText";
import { useChatAutoTranslate } from "@/game/chat/translation/useChatAutoTranslate";

type Phase = "none" | "offer" | "translating" | "downloading" | "translated";
type TranslatableChatTextParams = { text: string };
type TranslateParams = { phaseOnFailure: Phase };

const TARGET_LANGUAGE_BY_LOCALE: Partial<Record<Locale, string>> = {
  "pt-BR": "pt",
  "zh-CN": "zh",
  "zh-TW": "zh-Hant",
};

function getPrimaryLanguage(language: string): string {
  return language.split("-")[0]!.toLowerCase();
}

export function TranslatableChatText({ text }: TranslatableChatTextParams) {
  const { t, locale } = useTranslation();
  const [autoTranslate] = useChatAutoTranslate();
  const [phase, setPhase] = useState<Phase>("none");
  const [translation, setTranslation] = useState("");
  const sourceLanguageRef = useRef<string | undefined>(undefined);
  const requestRef = useRef(0);
  const targetLanguage = TARGET_LANGUAGE_BY_LOCALE[locale] ?? locale;

  async function translate({ phaseOnFailure }: TranslateParams): Promise<void> {
    const request = ++requestRef.current;
    const showPhase = (next: Phase) => {
      if (requestRef.current === request) {
        setPhase(next);
      }
    };
    showPhase("translating");
    try {
      const sourceLanguage = sourceLanguageRef.current ?? (await detectChatLanguage(text));
      if (!sourceLanguage || getPrimaryLanguage(sourceLanguage) === getPrimaryLanguage(targetLanguage)) {
        showPhase("none");
        return;
      }
      sourceLanguageRef.current = sourceLanguage;
      const translated = await translateChatText({
        text,
        sourceLanguage,
        targetLanguage,
        onDownload: () => showPhase("downloading"),
      });
      if (requestRef.current === request) {
        setTranslation(translated);
        setPhase("translated");
      }
    } catch {
      showPhase(phaseOnFailure);
    }
  }

  useEffect(() => {
    const api = getBrowserTranslationApi();
    sourceLanguageRef.current = undefined;
    const request = ++requestRef.current;
    setPhase("none");
    if (!api) {
      return;
    }
    void (async () => {
      try {
        const sourceLanguage = await detectChatLanguage(text);
        if (!sourceLanguage || getPrimaryLanguage(sourceLanguage) === getPrimaryLanguage(targetLanguage)) {
          return;
        }
        if ((await api.Translator.availability({ sourceLanguage, targetLanguage })) === "unavailable") {
          return;
        }
        sourceLanguageRef.current = sourceLanguage;
      } catch {
        sourceLanguageRef.current = undefined;
      }
      if (requestRef.current !== request) {
        return;
      }
      if (autoTranslate) {
        void translate({ phaseOnFailure: "offer" });
      } else {
        setPhase("offer");
      }
    })();
    return () => {
      requestRef.current += 1;
    };
  }, [text, targetLanguage, autoTranslate]);

  return (
    <span className="match-chat-window__text">
      <span>{text}</span>
      {phase === "translated" ? <span className="match-chat-window__translation">{translation}</span> : null}
      {phase === "offer" ? (
        <button type="button" onClick={() => void translate({ phaseOnFailure: "none" })}>
          {t("chat.translate")}
        </button>
      ) : null}
      {phase === "translated" ? (
        <button type="button" onClick={() => setPhase("offer")}>
          {t("chat.showOriginal")}
        </button>
      ) : null}
      {phase === "translating" || phase === "downloading" ? (
        <small role="status">{t(phase === "downloading" ? "chat.downloadingLanguage" : "chat.translating")}</small>
      ) : null}
    </span>
  );
}
