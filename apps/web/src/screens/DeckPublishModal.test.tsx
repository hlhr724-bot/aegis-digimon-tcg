// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewOutcome } from "../community/useCommunityPublications";
import type { DeckListing } from "../game/decks";
import { I18nProvider } from "../i18n";
import { DeckPublishModal } from "./DeckPublishModal";

const deck = { id: "custom-1", name: "Polite deck" } as DeckListing;

function renderReview(outcome: ReviewOutcome) {
  const onRequestReview = vi.fn<(deck: DeckListing, note: string) => Promise<ReviewOutcome>>(async () => outcome);
  const onClose = vi.fn<() => void>();
  render(
    <I18nProvider>
      <DeckPublishModal
        deck={deck}
        mode="review"
        onPublish={async () => ({ ok: true })}
        onRequestReview={onRequestReview}
        onUnpublish={async () => true}
        onClose={onClose}
      />
    </I18nProvider>,
  );
  return { onRequestReview, onClose };
}

afterEach(cleanup);

describe("requesting a review of a hidden deck", () => {
  it("sends the deck with the owner's note and closes", async () => {
    const { onRequestReview, onClose } = renderReview({ ok: true });
    fireEvent.change(screen.getByLabelText("Note to the moderator (optional)"), { target: { value: "Renamed it" } });
    fireEvent.click(screen.getByRole("button", { name: "Request review" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onRequestReview).toHaveBeenCalledWith(deck, "Renamed it");
  });

  it("explains that a review is already pending and stays open", async () => {
    const { onClose } = renderReview({ ok: false, error: "review_pending" });
    fireEvent.click(screen.getByRole("button", { name: "Request review" }));

    expect(await screen.findByText(/You already asked for a review/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
