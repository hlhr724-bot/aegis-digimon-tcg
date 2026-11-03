import { BOT_DECK_STORAGE_KEY } from "@/bot/botDeckStorageKey";

export function saveBotDeckPreference(botDeckId: string): void {
  try {
    localStorage.setItem(BOT_DECK_STORAGE_KEY, botDeckId);
  } catch {}
}
