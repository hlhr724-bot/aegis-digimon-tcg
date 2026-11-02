import { tokenDefinitions } from "@aegis/shared/cards/tokens";

const storagePrefix = "aegis.tokenArt.";
const listeners = new Set<() => void>();
const images = new Map<string, string>();

for (const token of tokenDefinitions) {
  try {
    const stored = localStorage.getItem(storagePrefix + token.cardId);
    if (stored?.match(/^data:image\/(webp|jpeg|png);base64,/)) {
      images.set(token.cardId, stored);
    }
  } catch {
    images.delete(token.cardId);
  }
}

type SetTokenArtParams = { cardId: string; dataUrl?: string };

export const tokenArtStore = {
  get(cardId: string | undefined): string | undefined {
    return cardId ? images.get(cardId) : undefined;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set({ cardId, dataUrl }: SetTokenArtParams): void {
    if (!tokenDefinitions.some((token) => token.cardId === cardId)) {
      throw new Error("Unknown token");
    }
    if (dataUrl !== undefined) {
      if (!/^data:image\/(webp|jpeg|png);base64,/.test(dataUrl)) {
        throw new Error("Invalid token image");
      }
      localStorage.setItem(storagePrefix + cardId, dataUrl);
      images.set(cardId, dataUrl);
    } else {
      localStorage.removeItem(storagePrefix + cardId);
      images.delete(cardId);
    }
    for (const listener of listeners) {
      listener();
    }
  },
};
