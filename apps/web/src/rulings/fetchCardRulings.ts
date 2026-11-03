import type { CardRulings } from "@aegis/shared/cards/CardRulings";
import { request } from "@/account/client";

export function fetchCardRulings(cardId: string, signal?: AbortSignal): Promise<CardRulings> {
  return request<CardRulings>(`/cards/${encodeURIComponent(cardId)}/rulings`, { signal });
}
