// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import { CardDetailDrawer } from "@/screens/CardDetailDrawer";
import { PoolCard } from "@/screens/PoolCard";
import { deckHasBetaCards } from "@/screens/deckHasBetaCards";

const unreleasedCardId = "LM-063";
const releasedCardId = "LM-057";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-14T12:00:00Z") });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderPoolCard(cardId: string) {
  render(
    <I18nProvider>
      <PoolCard
        cardId={cardId}
        inDeck={0}
        atMax={false}
        pairConflict={false}
        onAdd={() => undefined}
        onRemove={() => undefined}
        onOpen={() => undefined}
        selected={false}
      />
    </I18nProvider>,
  );
}

describe("beta card badge", () => {
  it("marks an unreleased card in the deck builder pool", () => {
    renderPoolCard(unreleasedCardId);

    expect(screen.getByText("Beta").getAttribute("title")).toBe("Not released yet. Only playable in beta battle mode.");
  });

  it("leaves a released card in the deck builder pool unmarked", () => {
    renderPoolCard(releasedCardId);

    expect(screen.queryByText("Beta")).toBeNull();
  });

  it("marks an unreleased card in the card detail drawer", () => {
    render(
      <I18nProvider>
        <CardDetailDrawer cardId={unreleasedCardId} onClose={() => undefined} />
      </I18nProvider>,
    );

    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("detects decks that contain an unreleased card", () => {
    expect(deckHasBetaCards({ mainDeck: [releasedCardId, unreleasedCardId], eggDeck: [] })).toBe(true);
    expect(deckHasBetaCards({ mainDeck: [releasedCardId], eggDeck: [] })).toBe(false);
  });
});
