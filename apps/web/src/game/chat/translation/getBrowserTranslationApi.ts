type Availability = "unavailable" | "downloadable" | "downloading" | "available";
type LanguagePair = { sourceLanguage: string; targetLanguage: string };
type BrowserTranslator = { translate: (text: string) => Promise<string> };
type BrowserLanguageDetector = {
  detect: (text: string) => Promise<{ detectedLanguage: string; confidence: number }[]>;
};

export type BrowserTranslationApi = {
  Translator: {
    availability: (pair: LanguagePair) => Promise<Availability>;
    create: (pair: LanguagePair) => Promise<BrowserTranslator>;
  };
  LanguageDetector: { create: () => Promise<BrowserLanguageDetector> };
};

export function getBrowserTranslationApi(): BrowserTranslationApi | undefined {
  const Translator = Reflect.get(globalThis, "Translator") as BrowserTranslationApi["Translator"] | undefined;
  const LanguageDetector = Reflect.get(globalThis, "LanguageDetector") as
    | BrowserTranslationApi["LanguageDetector"]
    | undefined;
  return Translator && LanguageDetector ? { Translator, LanguageDetector } : undefined;
}
