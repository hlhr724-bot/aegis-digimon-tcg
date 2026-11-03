import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { CommunityDeck } from "@aegis/shared/decks/community";
import type { LiveMatch } from "@aegis/shared/protocol/LiveMatch";
import type { PublicReplay } from "@aegis/shared/replays/PublicReplay";
import { CommunitySection } from "@/community/CommunitySection";
import { ProviderDeckBrowser } from "@/deckProviders/ProviderDeckBrowser";
import { providerApi } from "@/deckProviders/providerApi";
import { I18nProvider } from "@/i18n/I18nProvider";
import { PublicReplayCard } from "@/replays/PublicReplayCard";
import { setCardImageLanguage } from "@/screens/cardLanguage/setCardImageLanguage";
import { CommunityScreen } from "@/screens/community/CommunityScreen";
import { LiveMatchCard } from "@/screens/LiveMatchCard";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function findShownArtIds() {
  const artIds = Array.from(document.querySelectorAll<HTMLImageElement>("img"))
    .map((image) => image.src.split("/").pop()?.split(".")[0] ?? "")
    .filter((artId) => artId.startsWith("BT1-010"));
  return [...new Set(artIds)];
}

function buildLiveMatch(artId: string | undefined): LiveMatch {
  return {
    spectatorCode: "LIVE01",
    players: ["Player", "Rival"],
    playerPreviews: [{ cardId: "BT1-010", artId }, {}],
    format: "standard",
    startedAt: 0,
    spectators: 0,
  };
}

it.each<[string | undefined, "en" | "ja" | "zh" | undefined, string]>([
  ["BT1-010-C", undefined, "BT1-010"],
  ["BT1-010-C", "en", "BT1-010"],
  ["BT1-010-C", "ja", "BT1-010-J"],
  [undefined, "zh", "BT1-010-C"],
])("shows a live match player's %s art with viewer preference %s as %s", (artId, language, expectedArt) => {
  if (language) {
    setCardImageLanguage(language);
  }
  render(
    <I18nProvider>
      <LiveMatchCard match={buildLiveMatch(artId)} now={60_000} onWatch={() => undefined} />
    </I18nProvider>,
  );
  expect(findShownArtIds()).toEqual([expectedArt]);
});

it("shows public replay deck icons in the viewer card language", () => {
  setCardImageLanguage("ja");
  const replay: PublicReplay = {
    id: "replay",
    viewerSeat: 0,
    format: "standard",
    savedAt: 1,
    summary: {
      id: "match",
      players: ["Player", "Rival"],
      deckIcons: ["BT1-010", "BT1-010"],
      mode: "casual",
      startedAt: 1,
      finishedAt: 2,
      winnerSeat: 0,
      frameCount: 10,
    },
  } as PublicReplay;
  render(
    <I18nProvider>
      <PublicReplayCard replay={replay} onOpen={() => undefined} />
    </I18nProvider>,
  );
  expect(findShownArtIds()).toEqual(["BT1-010-J"]);
});

it("shows a community deck in the viewer card language instead of the author's art", async () => {
  const deck: CommunityDeck = {
    id: "author-deck",
    name: "Author deck",
    author: { id: "author", displayName: "Author" },
    colors: [],
    coverCardId: "BT1-010",
    likeCount: 0,
    copyCount: 0,
    likedByMe: false,
    legal: true,
    publishedAt: 1,
    updatedAt: 1,
    hasGuide: false,
    guide: null,
    status: "public",
    mainDeck: ["BT1-010"],
    eggDeck: [],
    mainDeckArts: ["BT1-010-C"],
    eggDeckArts: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify(deck), { status: 200 })),
  );
  render(
    <I18nProvider>
      <CommunityScreen
        deckId={deck.id}
        section={CommunitySection.DECKS.value}
        metaAvailable={false}
        signedIn
        accountId="reader"
        isAdmin={false}
        onOpenDeck={() => undefined}
        onBack={() => undefined}
        onSectionChange={() => undefined}
        onOpenRanked={() => undefined}
        onPlay={() => undefined}
        onCopy={() => undefined}
      />
    </I18nProvider>,
  );
  await screen.findByRole("heading", { name: "Author deck" });
  expect(findShownArtIds()).toEqual(["BT1-010"]);
});

it("shows provider archetype covers in the viewer card language", async () => {
  setCardImageLanguage("zh");
  vi.spyOn(providerApi, "meta").mockResolvedValue({
    data: [
      {
        id: 1,
        name: "Agumon",
        slug: "agumon",
        colors: ["Red"],
        share: 12,
        winRate: 54,
        pilots: 10,
        coverCardId: "BT1-010",
      },
    ],
    formats: [],
    page: 1,
    pages: 1,
  });
  render(
    <I18nProvider>
      <ProviderDeckBrowser collection="BT1" search="" onUse={() => undefined} onCopy={() => undefined} />
    </I18nProvider>,
  );
  await waitFor(() => expect(findShownArtIds()).toEqual(["BT1-010-C"]));
});
