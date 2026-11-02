import { DeckProvider } from "@aegis/shared/deckProviders/DeckProvider";
import { request } from "@/account/client";
import type {
  ProviderArchetype,
  ProviderDetail,
  ProviderList,
  ProviderPage,
} from "@aegis/shared/deckProviders/ProviderTypes";
import type { DeckFormat } from "@aegis/shared/deckFormat";

export const providerApi = {
  meta: (query: URLSearchParams) =>
    request<ProviderPage<ProviderArchetype>>(`/deck-providers/${DeckProvider.DIGILAB.value}/meta?${query}`),
  lists: (query: URLSearchParams) =>
    request<ProviderPage<ProviderList>>(`/deck-providers/${DeckProvider.DIGILAB.value}/lists?${query}`),
  detail: ({ id, format }: { id: number; format: DeckFormat }) =>
    request<ProviderDetail>(
      `/deck-providers/${DeckProvider.DIGILAB.value}/${id}?playFormat=${encodeURIComponent(format)}`,
    ),
};
