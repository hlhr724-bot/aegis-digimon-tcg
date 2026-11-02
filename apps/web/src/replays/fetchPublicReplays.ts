import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { PublicReplayPage } from "@aegis/shared/replays/PublicReplay";
import { request } from "@/account/client";

export type PublicReplayRequest = {
  limit: number;
  cursor?: string;
  format?: DeckFormat;
};

export function fetchPublicReplays({ limit, cursor, format }: PublicReplayRequest): Promise<PublicReplayPage> {
  const query = new URLSearchParams({
    limit: String(limit),
    ...(cursor ? { cursor } : {}),
    ...(format ? { format } : {}),
  });
  return request<PublicReplayPage>(`/replays/public?${query}`);
}
