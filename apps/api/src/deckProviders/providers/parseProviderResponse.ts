import { ProviderError } from "#api/deckProviders/ProviderError";
import type {
  ProviderArchetype,
  ProviderDetail,
  ProviderList,
  ProviderPage,
} from "@aegis/shared/deckProviders/ProviderTypes";
import { deckLegality } from "@aegis/shared/decks/legality";
import type { DeckFormat } from "@aegis/shared/deckFormat";

type Row = Record<string, unknown>;
type Params = { body: unknown; kind: "meta" | "lists" | "detail"; format?: DeckFormat };

function getObject(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderError(502);
  }
  return value as Row;
}
function getText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function getId(value: unknown): number {
  const id = getNumber(value);
  if (id === null || !Number.isSafeInteger(id) || id <= 0) {
    throw new ProviderError(502);
  }
  return id;
}
function getColors(row: Row): string[] {
  return [row.primary_color, row.secondary_color].filter((value): value is string => typeof value === "string");
}
function getList(row: Row): ProviderList {
  const id = getId(row.result_id);
  return {
    id,
    coverCardId: getText(row.display_card_id) ?? undefined,
    name: getText(row.archetype_name) ?? "DigiLab",
    player: getText(row.player_name),
    date: getText(row.event_date),
    format: getText(row.format),
    event: [getText(row.store_name), getText(row.event_type)].filter(Boolean).join(" · ") || null,
    placement: getNumber(row.placement),
    wins: getNumber(row.wins),
    losses: getNumber(row.losses),
    ties: getNumber(row.ties),
    colors: getColors(row),
    sourceUrl: `https://digimon.digilab.cards/decklist/${id}`,
  };
}
function getCards(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new ProviderError(502);
  }
  return value.flatMap((entry) => {
    const row = getObject(entry);
    const id = getText(row.card_id);
    const count = getNumber(row.count);
    if (!id || count === null || !Number.isInteger(count) || count < 1 || count > 50) {
      throw new ProviderError(502);
    }
    return Array<string>(count).fill(id);
  });
}
function getExternalUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
export function parseProviderResponse({
  body,
  kind,
  format,
}: Params): ProviderPage<ProviderArchetype> | ProviderPage<ProviderList> | ProviderDetail {
  const row = getObject(body);
  if (kind === "detail") {
    let mainDeck: string[] | null = null;
    let eggDeck: string[] | null = null;
    if (row.decklist !== null && row.decklist !== undefined) {
      const list = getObject(row.decklist);
      mainDeck = [...getCards(list.digimon), ...getCards(list.tamers), ...getCards(list.options)];
      eggDeck = getCards(list.eggs);
      if (mainDeck.length > 100 || eggDeck.length > 100) {
        throw new ProviderError(502);
      }
    }
    return {
      ...getList(row),
      collectedAt: getNumber(row.providerDataCollectedAt) ?? undefined,
      stale: row.providerDataStale === true,
      externalUrl: getExternalUrl(row.decklist_url),
      mainDeck,
      eggDeck,
      legality: mainDeck && eggDeck ? deckLegality({ mainDeck, eggDeck }, { format }) : null,
    };
  }
  if (!Array.isArray(row.data)) {
    throw new ProviderError(502);
  }
  const pagination = getObject(row.pagination);
  const metadata = {
    collectedAt: getNumber(row.providerDataCollectedAt) ?? undefined,
    stale: row.providerDataStale === true,
    page: getNumber(pagination.page) ?? 1,
    pages: getNumber(pagination.total_pages) ?? 0,
    formats: Array.isArray(row.formats)
      ? row.formats
          .filter((entry) => {
            const release = getText(getObject(entry).release_date);
            return !release || release.slice(0, 10) <= new Date().toISOString().slice(0, 10);
          })
          .sort((a, b) =>
            String(getObject(b).release_date ?? "").localeCompare(String(getObject(a).release_date ?? "")),
          )
          .map((entry) => {
            const item = getObject(entry);
            return {
              id: getText(item.format_id) ?? getText(item.format) ?? "",
              name: getText(item.display_name) ?? getText(item.set_name) ?? String(item.format_id ?? item.format),
            };
          })
          .filter((item) => item.id)
      : [],
  };
  if (kind === "lists") {
    return { ...metadata, data: row.data.map((entry) => getList(getObject(entry))) };
  }
  return {
    ...metadata,
    data: row.data
      .map((entry) => {
        const item = getObject(entry);
        return {
          id: getId(item.archetype_id),
          name: getText(item.archetype_name) ?? "DigiLab",
          slug: getText(item.slug) ?? "",
          coverCardId: getText(item.display_card_id) ?? undefined,
          deckCount: getNumber(item.decklists),
          colors: getColors(item),
          share: getNumber(item.meta_pct),
          winRate: getNumber(item.win_pct),
          pilots: getNumber(item.pilots),
        };
      })
      .sort((a, b) => (b.share ?? 0) - (a.share ?? 0)),
  };
}
