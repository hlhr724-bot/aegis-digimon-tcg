import { useCallback, useEffect, useState } from "react";
import type { CommunityPublication, CommunityPublishError, CommunityReviewError } from "@aegis/shared";
import { AccountApiError, accountApi } from "../account/client";
import type { DeckListing } from "../game/decks";
import { communityApi } from "./client";

export type PublishOutcome = { ok: true } | { ok: false; error: CommunityPublishError | "failed" };

export type ReviewOutcome = { ok: true } | { ok: false; error: CommunityReviewError | "failed" };

const PUBLISH_ERRORS: readonly string[] = ["deck_not_found", "deck_not_legal", "name_not_allowed", "deck_hidden"];
const REVIEW_ERRORS: readonly string[] = [
  "deck_not_found",
  "deck_not_hidden",
  "review_pending",
  "deck_not_legal",
  "name_not_allowed",
];

/** The signed-in player's public decks, keyed by the saved deck they were published from. */
export function useCommunityPublications(signedIn: boolean) {
  const [publications, setPublications] = useState<ReadonlyMap<string, CommunityPublication>>(new Map());

  useEffect(() => {
    if (!signedIn) {
      setPublications(new Map());
      return;
    }
    let current = true;
    communityApi
      .publications()
      .then((list) => {
        if (current) setPublications(new Map(list.map((publication) => [publication.sourceDeckId, publication])));
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [signedIn]);

  // The api publishes what it has stored, and the deck builder saves in the background, so the
  // deck is saved again first to make sure the public copy is the version on screen.
  const publish = useCallback(async (deck: DeckListing): Promise<PublishOutcome> => {
    try {
      await accountApi.saveDeck(deck);
      const publication = await communityApi.publish(deck.id);
      setPublications((current) => new Map(current).set(deck.id, publication));
      return { ok: true };
    } catch (error) {
      const code = error instanceof AccountApiError ? error.code : undefined;
      return { ok: false, error: code && PUBLISH_ERRORS.includes(code) ? (code as CommunityPublishError) : "failed" };
    }
  }, []);

  const requestReview = useCallback(async (deck: DeckListing, note: string): Promise<ReviewOutcome> => {
    try {
      await accountApi.saveDeck(deck);
      const publication = await communityApi.requestReview(deck.id, note.trim() ? { note } : {});
      setPublications((current) => new Map(current).set(deck.id, publication));
      return { ok: true };
    } catch (error) {
      const code = error instanceof AccountApiError ? error.code : undefined;
      return { ok: false, error: code && REVIEW_ERRORS.includes(code) ? (code as CommunityReviewError) : "failed" };
    }
  }, []);

  const unpublish = useCallback(async (deckId: string): Promise<boolean> => {
    try {
      await communityApi.unpublish(deckId);
      setPublications((current) => {
        const next = new Map(current);
        next.delete(deckId);
        return next;
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  return { publications, publish, requestReview, unpublish };
}
