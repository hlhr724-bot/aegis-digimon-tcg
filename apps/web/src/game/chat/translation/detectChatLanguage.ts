import { getBrowserTranslationApi, type BrowserTranslationApi } from "@/game/chat/translation/getBrowserTranslationApi";

const MINIMUM_CONFIDENCE = 0.5;
const UNDETERMINED = "und";

type Detector = Awaited<ReturnType<BrowserTranslationApi["LanguageDetector"]["create"]>>;
let detector: Promise<Detector> | undefined;

export async function detectChatLanguage(text: string): Promise<string | undefined> {
  const api = getBrowserTranslationApi();
  if (!api) {
    throw new Error("translation_unavailable");
  }
  detector ??= api.LanguageDetector.create();
  let ready: Detector;
  try {
    ready = await detector;
  } catch (error) {
    detector = undefined;
    throw error;
  }
  const [best] = await ready.detect(text);
  if (!best || best.detectedLanguage === UNDETERMINED || best.confidence < MINIMUM_CONFIDENCE) {
    return undefined;
  }
  return best.detectedLanguage;
}
