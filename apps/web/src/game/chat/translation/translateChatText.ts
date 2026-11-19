import { getBrowserTranslationApi, type BrowserTranslationApi } from "@/game/chat/translation/getBrowserTranslationApi";

type Translator = Awaited<ReturnType<BrowserTranslationApi["Translator"]["create"]>>;
type TranslateChatTextParams = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  onDownload: () => void;
};

const translators = new Map<string, Promise<Translator>>();

export async function translateChatText({
  text,
  sourceLanguage,
  targetLanguage,
  onDownload,
}: TranslateChatTextParams): Promise<string> {
  const api = getBrowserTranslationApi();
  if (!api) {
    throw new Error("translation_unavailable");
  }
  const key = `${sourceLanguage}>${targetLanguage}`;
  let translator = translators.get(key);
  if (!translator) {
    const pair = { sourceLanguage, targetLanguage };
    const availability = await api.Translator.availability(pair);
    if (availability === "unavailable") {
      throw new Error("translation_unavailable");
    }
    if (availability !== "available") {
      onDownload();
    }
    translator = api.Translator.create(pair);
    translators.set(key, translator);
  }
  try {
    return await (await translator).translate(text);
  } catch (error) {
    translators.delete(key);
    throw error;
  }
}
