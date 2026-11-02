import { COMMUNITY_MODERATION_NOTE_MAX } from "@aegis/shared";
import { useId, useState } from "react";
import type { PublishOutcome, ReviewOutcome } from "../community/useCommunityPublications";
import { Button } from "../design/primitives";
import { Icons } from "../design/icons";
import type { DeckListing } from "../game/decks";
import { useTranslation, type TranslationKey } from "../i18n";

export type PublishMode = "publish" | "update" | "unpublish" | "review";

const COPY: Record<PublishMode, { title: TranslationKey; body: TranslationKey; confirm: TranslationKey }> = {
  publish: {
    title: "community.publish.title",
    body: "community.publish.body",
    confirm: "community.publish.action",
  },
  update: {
    title: "community.publish.updateTitle",
    body: "community.publish.updateBody",
    confirm: "community.publish.update",
  },
  unpublish: {
    title: "community.publish.unpublishTitle",
    body: "community.publish.unpublishBody",
    confirm: "community.publish.unpublish",
  },
  review: {
    title: "community.review.title",
    body: "community.review.body",
    confirm: "community.review.action",
  },
};

const ERRORS: Record<
  Exclude<PublishOutcome, { ok: true }>["error"] | Exclude<ReviewOutcome, { ok: true }>["error"],
  TranslationKey
> = {
  deck_not_found: "community.publish.errorGeneric",
  deck_not_legal: "community.publish.errorNotLegal",
  name_not_allowed: "community.publish.errorName",
  deck_hidden: "community.publish.errorHidden",
  deck_not_hidden: "community.review.errorNotHidden",
  review_pending: "community.review.errorPending",
  failed: "community.publish.errorGeneric",
};

export function DeckPublishModal({
  deck,
  mode,
  onPublish,
  onRequestReview,
  onUnpublish,
  onClose,
}: {
  deck: DeckListing;
  mode: PublishMode;
  onPublish: (deck: DeckListing) => Promise<PublishOutcome>;
  onRequestReview: (deck: DeckListing, note: string) => Promise<ReviewOutcome>;
  onUnpublish: (deckId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const noteId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey>();
  const [note, setNote] = useState("");
  const copy = COPY[mode];

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    if (mode === "unpublish") {
      if (await onUnpublish(deck.id)) onClose();
      else setError("community.publish.errorGeneric");
    } else if (mode === "review") {
      const outcome = await onRequestReview(deck, note);
      if (outcome.ok) onClose();
      else setError(ERRORS[outcome.error]);
    } else {
      const outcome = await onPublish(deck);
      if (outcome.ok) onClose();
      else setError(ERRORS[outcome.error]);
    }
    setBusy(false);
  };

  return (
    <div className="deck-modal-layer" role="dialog" aria-modal="true" aria-labelledby="deck-publish-title">
      <div className="deck-modal">
        <h2 id="deck-publish-title" className="deck-modal__title">
          {t(copy.title, { name: deck.name })}
        </h2>
        <p className="deck-modal__hint">{t(copy.body)}</p>
        {mode === "publish" ? <p className="deck-modal__hint">{t("community.publish.rules")}</p> : null}
        {mode === "review" ? (
          <div className="aegis-field">
            <label className="aegis-field__label" htmlFor={noteId}>
              {t("community.review.noteLabel")}
            </label>
            <textarea
              id={noteId}
              className="aegis-field__control"
              rows={3}
              maxLength={COMMUNITY_MODERATION_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        ) : null}
        {error ? (
          <p className="deck-modal__error" role="alert">
            {t(error)}
          </p>
        ) : null}
        <div className="deck-modal__actions">
          <Button variant="secondary" size="sm" autoFocus onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={mode === "unpublish" ? "danger" : "primary"}
            size="sm"
            icon={mode === "unpublish" ? undefined : Icons.Users}
            disabled={busy}
            onClick={confirm}
          >
            {t(copy.confirm)}
          </Button>
        </div>
      </div>
    </div>
  );
}
