import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { Seat } from "@aegis/shared/schema/enums";
import { Permanent } from "@aegis/shared/schema/Permanent";
import { PlayerState } from "@aegis/shared/schema/PlayerState";
import { I18nProvider } from "@/i18n/I18nProvider";
import { PileViewers } from "@/game/screen/layout/PileViewers";
import { SecurityCardSlot } from "@/game/SecurityCardSlot";
import { Side } from "@/game/side";
import { collectViewerCardArtIds } from "@/screens/cardLanguage/collectViewerCardArtIds";
import { setCardImageLanguage } from "@/screens/cardLanguage/setCardImageLanguage";
import { ViewerCardArtIdsContext } from "@/screens/cardLanguage/ViewerCardArtIdsContext";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function buildCard({ artId, ownerSeat }: { artId: string; ownerSeat: Seat }) {
  const card = new CardInstance();
  card.cardId = "BT1-010";
  card.artId = artId;
  card.instanceId = `${artId}-${ownerSeat}`;
  card.ownerSeat = ownerSeat;
  return card;
}

function findImageSources() {
  return Array.from(document.querySelectorAll<HTMLImageElement>("img")).map((image) => image.src);
}

it.each<[string, "en" | "ja" | undefined, string, string[]]>([
  ["BT1-010-J", undefined, "BT1-010", []],
  ["BT1-010-C", "en", "BT1-010", []],
  ["BT1-010-C", "ja", "BT1-010-J", []],
  ["BT1-010_P1-J", "ja", "BT1-010_P1-J", []],
  ["BT1-010-C", "en", "BT1-010-C", ["BT1-010-C"]],
])("shows trash %s with preference %s as %s", (artId, language, expectedArt, viewerArtIds) => {
  if (language) {
    setCardImageLanguage(language);
  }
  const owner = new PlayerState();
  owner.trash.push(buildCard({ artId, ownerSeat: 1 }));
  render(
    <I18nProvider>
      <ViewerCardArtIdsContext.Provider value={new Set(viewerArtIds)}>
        <PileViewers
          trashView={Side.Opponent}
          securityView={null}
          viewer={new PlayerState()}
          opponent={owner}
          opponentName="Opponent"
          revealedZoneView={null}
          sheet={false}
          trashActivatable={false}
          onActivateTrashEffect={() => undefined}
          onCloseTrash={() => undefined}
          onCloseSecurity={() => undefined}
          onCloseRevealedZone={() => undefined}
        />
      </ViewerCardArtIdsContext.Provider>
    </I18nProvider>,
  );
  const sources = findImageSources();
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) {
    expect(source).toContain(`${expectedArt}.`);
  }
});

it("shows a revealed opponent security card in the viewer card language", () => {
  setCardImageLanguage("zh");
  render(
    <I18nProvider>
      <ViewerCardArtIdsContext.Provider value={new Set()}>
        <SecurityCardSlot cardId="BT1-010" artId="BT1-010-J" faceUp />
      </ViewerCardArtIdsContext.Provider>
    </I18nProvider>,
  );
  expect(findImageSources()).toEqual([expect.stringContaining("BT1-010-C.")]);
});

it("keeps chosen artwork outside a match", () => {
  setCardImageLanguage("zh");
  render(
    <I18nProvider>
      <SecurityCardSlot cardId="BT1-010" artId="BT1-010-J" faceUp />
    </I18nProvider>,
  );
  expect(findImageSources()).toEqual([expect.stringContaining("BT1-010-J.")]);
});

it("collects the viewer deck and owned cards but not opponent cards", () => {
  const viewer = new PlayerState();
  viewer.seat = 0;
  viewer.hand.push(buildCard({ artId: "BT1-010_P2-J", ownerSeat: 0 }));
  const opponent = new PlayerState();
  opponent.seat = 1;
  const permanent = new Permanent();
  permanent.topCard = buildCard({ artId: "BT1-010-K", ownerSeat: 1 });
  permanent.stack.push(buildCard({ artId: "BT1-010_P3-C", ownerSeat: 0 }));
  opponent.battleArea.push(permanent);
  const artIds = collectViewerCardArtIds({
    deck: { mainDeck: ["BT1-010", "BT1-010"], eggDeck: [], mainDeckArts: ["BT1-010_P1", "unknown"] },
    players: [viewer, opponent],
    viewerSeat: 0,
  });
  expect(artIds).toEqual(["BT1-010", "BT1-010_P1", "BT1-010_P2-J", "BT1-010_P3-C"]);
});
