import { DECKS } from "@/game/decks";
import { deckLegality } from "@aegis/shared/decks/legality";
import type { DeckListing } from "@/game/decks";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ProviderArchetypeDecks } from "@/deckProviders/ProviderArchetypeDecks";
import { providerApi } from "@/deckProviders/providerApi";
import type { ProviderList } from "@aegis/shared/deckProviders/ProviderTypes";

const list: ProviderList = {
  id: 12,
  name: "Blue Flare",
  colors: ["Blue"],
  player: "Tamer",
  date: "2026-10-10",
  format: "EX13",
  event: "Locals",
  placement: 1,
  wins: 4,
  losses: 0,
  ties: 0,
  sourceUrl: "https://digimon.digilab.cards/decklist/12",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("lazily opens cards, keeping unknown lists unplayable", async () => {
  vi.spyOn(providerApi, "meta").mockResolvedValue({
    data: [{ id: 1, name: "Blue Flare", slug: "blue-flare", colors: ["Blue"], share: 12, winRate: 55, pilots: 42 }],
    formats: [{ id: "EX13", name: "Chivalrous XIII" }],
    page: 1,
    pages: 1,
  });
  vi.spyOn(providerApi, "lists").mockResolvedValue({ data: [list], formats: [], page: 1, pages: 1 });
  const detail = vi
    .spyOn(providerApi, "detail")
    .mockResolvedValue({ ...list, mainDeck: null, eggDeck: null, legality: null, externalUrl: null });
  render(
    <I18nProvider>
      <ProviderArchetypeDecks
        collection="EX13"
        archetype={1}
        onCopy={vi.fn<() => void>()}
        onUse={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  await screen.findByRole("button", { name: "Deck information" });
  expect(detail).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Deck information" }));
  await screen.findByText("The source has no parsed card list for this deck.");
  expect((screen.getByRole("button", { name: "Use for play" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Copy to my decks" }) as HTMLButtonElement).disabled).toBe(true);
  expect(detail).toHaveBeenCalledWith({ id: 12, format: "standard" });
});
it("recovers from a provider failure without navigating away", async () => {
  vi.spyOn(providerApi, "meta").mockResolvedValue({ data: [], formats: [], page: 1, pages: 1 });
  const lists = vi
    .spyOn(providerApi, "lists")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ data: [], formats: [], page: 1, pages: 0 });
  render(
    <I18nProvider>
      <ProviderArchetypeDecks
        collection="EX13"
        archetype={1}
        onCopy={vi.fn<() => void>()}
        onUse={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(lists).toHaveBeenCalledTimes(2));
  await screen.findByText("No decks found for these filters.");
});

it.each(["Use for play", "Copy to my decks"])("hands a known list to the existing %s flow", async (action) => {
  const starter = DECKS[0]!;
  vi.spyOn(providerApi, "meta").mockResolvedValue({ data: [], formats: [], page: 1, pages: 1 });
  vi.spyOn(providerApi, "lists").mockResolvedValue({ data: [list], formats: [], page: 1, pages: 1 });
  vi.spyOn(providerApi, "detail").mockResolvedValue({
    ...list,
    mainDeck: starter.mainDeck,
    eggDeck: starter.eggDeck,
    legality: deckLegality(starter),
    externalUrl: null,
  });
  const onUse = vi.fn<(deck: DeckListing) => void>();
  const onCopy = vi.fn<(deck: DeckListing) => void>();
  render(
    <I18nProvider>
      <ProviderArchetypeDecks collection="EX13" archetype={1} onUse={onUse} onCopy={onCopy} />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Deck information" }));
  fireEvent.click(await screen.findByRole("button", { name: action }));
  const selected = action === "Use for play" ? onUse : onCopy;
  expect(selected).toHaveBeenCalledWith(
    expect.objectContaining({ mainDeck: starter.mainDeck, eggDeck: starter.eggDeck }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it.each([true, false])(
  "selects a playable deck directly and rejects unavailable lists (playable: %s)",
  async (playable) => {
    const starter = DECKS[0]!;
    vi.spyOn(providerApi, "meta").mockResolvedValue({ data: [], formats: [], page: 1, pages: 1 });
    vi.spyOn(providerApi, "lists").mockResolvedValue({ data: [list], formats: [], page: 1, pages: 1 });
    vi.spyOn(providerApi, "detail").mockResolvedValue({
      ...list,
      mainDeck: playable ? starter.mainDeck : null,
      eggDeck: playable ? starter.eggDeck : null,
      legality: playable ? deckLegality(starter) : null,
      externalUrl: null,
    });
    const onUse = vi.fn<(deck: DeckListing) => void>();
    render(
      <I18nProvider>
        <ProviderArchetypeDecks collection="EX13" archetype={1} onUse={onUse} onCopy={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Blue Flare" }));
    if (playable) {
      await waitFor(() =>
        expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: "provider-12", mainDeck: starter.mainDeck })),
      );
    } else {
      await screen.findByRole("alert");
      expect(onUse).not.toHaveBeenCalled();
    }
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

it("keeps selection feedback on the card without adding loading text and exposes a separate source link", async () => {
  const starter = DECKS[0]!;
  vi.spyOn(providerApi, "lists").mockResolvedValue({ data: [list], formats: [], page: 1, pages: 10 });
  let resolveDetail: ((detail: import("@aegis/shared/deckProviders/ProviderTypes").ProviderDetail) => void) | undefined;
  vi.spyOn(providerApi, "detail").mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
  );
  const onUse = vi.fn();
  render(
    <I18nProvider>
      <ProviderArchetypeDecks collection="EX13" archetype={1} onUse={onUse} onCopy={vi.fn()} />
    </I18nProvider>,
  );
  const card = await screen.findByRole("button", { name: "Blue Flare" });
  expect(screen.getByRole("link", { name: "View on DigiLab" }).getAttribute("href")).toBe(list.sourceUrl);
  fireEvent.click(card);
  expect(document.querySelector('.provider-deck-option[aria-busy="true"]')).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  resolveDetail!({
    ...list,
    mainDeck: starter.mainDeck,
    eggDeck: starter.eggDeck,
    legality: deckLegality(starter),
    externalUrl: null,
  });
  await waitFor(() => expect(onUse).toHaveBeenCalledTimes(1));
  expect(document.querySelector('.provider-deck-option[aria-busy="true"]')).toBeNull();
});
