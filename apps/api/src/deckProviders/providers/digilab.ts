import { DeckProvider } from "@aegis/shared/deckProviders/DeckProvider";
import { ProviderSort } from "@aegis/shared/deckProviders/ProviderSort";
import { parseProviderResponse } from "#api/deckProviders/providers/parseProviderResponse";

type MetaParams = { format?: string; page?: number; perPage?: number };
type ListParams = MetaParams & { archetype?: string; search?: string; sort?: ProviderSort };

function buildMetaPath({ format = "", page = 1, perPage = 20 }: MetaParams = {}): string {
  const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (format) {
    query.set("format", format);
  }
  query.set("sort", "entries");
  query.set("sort_dir", "desc");
  return `meta?${query}`;
}
function buildListsPath({
  format = "",
  page = 1,
  perPage = 20,
  archetype = "",
  search = "",
  sort = ProviderSort.DATE.value,
}: ListParams): string {
  const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (format) {
    query.set("format", format);
  }
  if (archetype) {
    query.set("archetype_id", archetype);
  }
  if (search) {
    query.set("search", search);
  }
  query.set("sort", sort);
  query.set(
    "sort_dir",
    sort === ProviderSort.PLACEMENT.value ? ProviderSort.PLACEMENT.direction : ProviderSort.DATE.direction,
  );
  return `decklists?${query}`;
}

export const digilabProvider = {
  ...DeckProvider.DIGILAB,
  apiUrl: "https://digimon.digilab.cards/api/",
  keyVariable: "AEGIS_DIGILAB_API_KEY",
  parseResponse: parseProviderResponse,
  buildMetaPath,
  buildListsPath,
  buildDetailPath: (id: number) => `decklist/${id}`,
};
