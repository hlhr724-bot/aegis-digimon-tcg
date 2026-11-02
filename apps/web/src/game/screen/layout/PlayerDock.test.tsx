// @vitest-environment jsdom
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { CardOpenerProvider } from "@/game/cardLinks";
import { PlayerDock } from "./PlayerDock";

afterEach(cleanup);

function renderSpectatorDock(props: Partial<ComponentProps<typeof PlayerDock>>, onOpenCard = vi.fn<(cardId: string, artId?: string) => void>()) {
  render(
    <I18nProvider>
      <CardOpenerProvider onOpenCard={onOpenCard}>
        <PlayerDock
          spectating
          breedingDock={null}
          pileDock={null}
          handDockRef={createRef<HTMLDivElement>()}
          cardWidth={60}
          cards={[]}
          actionBar={undefined}
          eggDeckCount={0}
          handCount={2}
          deckCount={10}
          trashCount={0}
          startDrag={() => {}}
          selectCard={() => {}}
          onHoverChange={() => {}}
          {...props}
        />
      </CardOpenerProvider>
    </I18nProvider>,
  );
  return onOpenCard;
}

describe("spectator hand at the bottom of the board", () => {
  it("opens each card of the revealed hand once the match is over", () => {
    const onOpenCard = renderSpectatorDock({
      revealedHand: [
        { cardId: "BT1-010", artId: "BT1-010" },
        { cardId: "BT1-085", artId: "BT1-085_P1" },
      ],
    });

    const cards = screen.getAllByRole("button");
    expect(cards).toHaveLength(2);
    fireEvent.click(cards[1]!);

    expect(onOpenCard).toHaveBeenCalledWith("BT1-085", "BT1-085_P1");
  });

  it("keeps the hand face down while the match is still running", () => {
    renderSpectatorDock({});

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
