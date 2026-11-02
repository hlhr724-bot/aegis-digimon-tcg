import { useState } from "react";
import { COMMUNITY_GUIDE_MAX } from "@aegis/shared/decks/community";
import { normalizeDeckGuide } from "@aegis/shared/decks/guide/normalizeDeckGuide";
import { AccountApiError } from "@/account/client";
import { communityApi } from "@/community/client";
import { Alert, Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";
import { GuideRichText } from "@/screens/community/guide/GuideRichText";

type Props = {
  deckId: string;
  initialGuide: string | null;
  onSaved: (guide: string | null) => void;
  onCancel: () => void;
};

function getErrorKey(error: unknown): TranslationKey {
  if (error instanceof AccountApiError) {
    if (error.code === "guide_too_long") {
      return "community.guide.errorTooLong";
    }
    if (error.code === "guide_not_allowed") {
      return "community.guide.errorNotAllowed";
    }
    if (error.status === 404) {
      return "community.guide.errorGone";
    }
    if (error.status === 429) {
      return "community.guide.errorTooMany";
    }
  }
  return "community.guide.errorGeneric";
}

export function DeckGuideEditor({ deckId, initialGuide, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const [guide, setGuide] = useState(initialGuide ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<TranslationKey>();
  const length = normalizeDeckGuide({ raw: guide })?.length ?? 0;
  async function saveGuide(value: string | null) {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const result = await communityApi.updateGuide(deckId, value);
      onSaved(result.guide);
    } catch (failure) {
      setError(getErrorKey(failure));
      setSaving(false);
    }
  }
  return (
    <div className="community-guide__editor" aria-busy={saving}>
      <GuideRichText initialGuide={initialGuide} disabled={saving} onChange={setGuide} />
      <div className="community-guide__hint">
        <p>{t("community.guide.hint")}</p>
        <span aria-live="polite">
          {length}/{COMMUNITY_GUIDE_MAX}
        </span>
      </div>
      {length > COMMUNITY_GUIDE_MAX ? (
        <Alert tone="danger">{t("community.guide.errorTooLong", { max: COMMUNITY_GUIDE_MAX })}</Alert>
      ) : null}
      {error ? <Alert tone="danger">{t(error, { max: COMMUNITY_GUIDE_MAX })}</Alert> : null}
      <div className="community-guide__actions">
        <Button disabled={saving || length > COMMUNITY_GUIDE_MAX} onClick={() => void saveGuide(guide)}>
          {t(saving ? "community.guide.saving" : "community.guide.save")}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        {initialGuide ? (
          <Button variant="danger" disabled={saving} onClick={() => void saveGuide(null)}>
            {t("community.guide.clear")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
