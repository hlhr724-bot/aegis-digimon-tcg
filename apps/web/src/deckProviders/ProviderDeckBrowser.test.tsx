import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderDeckBrowser } from "@/deckProviders/ProviderDeckBrowser";
import { providerApi } from "@/deckProviders/providerApi";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DECKS } from "@/game/decks";
import { deckLegality } from "@aegis/shared/decks/legality";
import type { ProviderList } from "@aegis/shared/deckProviders/ProviderTypes";

const list: ProviderList = {
  id: 12,
  name: "Examon",
  player: "Tamer",
  date: null,
  event: "Locals",
  format: "EX13",
  placement: 1,
  wins: 4,
  losses: 0,
  ties: 0,
  colors: ["Blue"],
  sourceUrl: "https://digimon.digilab.cards/decklist/12",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows up to 25 selectable archetypes immediately, with versions opened only on request", async () => {
  const meta = vi.spyOn(providerApi, "meta").mockResolvedValue({
    data: Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      name: `Archetype ${index + 1}`,
      slug: `archetype-${index + 1}`,
      colors: ["Blue"],
      share: 12,
      winRate: 54,
      pilots: 10,
    })),
    formats: [],
    page: 1,
    pages: 9,
  });
  const lists = vi.spyOn(providerApi, "lists").mockResolvedValue({ data: [], formats: [], page: 1, pages: 50 });
  render(
    <I18nProvider>
      <ProviderDeckBrowser collection="EX13" search="" onUse={vi.fn()} onCopy={vi.fn()} />
    </I18nProvider>,
  );
  await screen.findByText("25 archetypes");
  expect(meta.mock.calls[0]![0].get("perPage")).toBe("25");
  expect(screen.getByRole("button", { name: "Archetype 25" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Archetype 26" })).toBeNull();
  expect(lists).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Recent versions · Archetype 2" }));
  await screen.findByRole("dialog", { name: "Archetype 2" });
  await waitFor(() => expect(lists).toHaveBeenCalledTimes(1));
  expect(lists.mock.calls[0]![0].get("archetype")).toBe("2");
  expect(lists.mock.calls[0]![0].get("perPage")).toBe("3");
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
});

it("selects a playable recent version directly without opening details or showing loading text", async () => {
  const starter = DECKS[0]!;
  vi.spyOn(providerApi, "meta").mockResolvedValue({
    data: [
      {
        id: 1,
        name: "Examon",
        slug: "examon",
        coverCardId: "EX13-045",
        deckCount: 57,
        playableDeck: {
          ...list,
          id: 13,
          mainDeck: starter.mainDeck,
          eggDeck: starter.eggDeck,
          legality: deckLegality(starter),
          externalUrl: null,
        },
        colors: ["Blue"],
        share: 12,
        winRate: 54,
        pilots: 10,
      },
    ],
    formats: [],
    page: 1,
    pages: 1,
  });
  const lists = vi.spyOn(providerApi, "lists");
  const detail = vi.spyOn(providerApi, "detail");
  const onUse = vi.fn();
  render(
    <I18nProvider>
      <ProviderDeckBrowser collection="EX13" search="" onUse={onUse} onCopy={vi.fn()} />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Examon" }));
  expect(lists).not.toHaveBeenCalled();
  expect(detail).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
  await waitFor(() =>
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: "provider-13", coverCardId: "EX13-045" })),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});
