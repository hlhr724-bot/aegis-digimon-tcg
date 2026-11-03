import { BOT_DECK_STORAGE_KEY } from "@/bot/botDeckStorageKey";

export function readBotDeckPreference(): string {
  try {
    return localStorage.getItem(BOT_DECK_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
