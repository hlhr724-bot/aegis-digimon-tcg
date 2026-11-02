import type { Translate, TranslationKey } from "@/i18n/translationTypes";

type Params = { error?: string; t: Translate };
const messages: Record<string, TranslationKey> = {
  ranked_unavailable: "ranked.season.unavailable",
  ranked_invalid_deck: "ranked.season.invalidDeck",
  ranked_invalid_queue: "ranked.season.unsupportedFormat",
  ranked_already_queued: "ranked.season.alreadyQueued",
  ranked_already_playing: "ranked.season.alreadyPlaying",
  ranked_queue_expired: "ranked.season.queueExpired",
};

export function getRankedConnectionError({ error, t }: Params): string | undefined {
  const key = error && Object.hasOwn(messages, error) ? messages[error] : undefined;
  return key ? t(key) : undefined;
}
