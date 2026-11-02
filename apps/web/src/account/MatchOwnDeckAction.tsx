import { useState } from "react";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import type { DeckListing } from "@/game/decks";
import { UsedDeckDialog } from "@/game/UsedDeckDialog";
import { useTranslation } from "@/i18n/useTranslation";
import { accountApi } from "@/account/client";

type Props = { matchId: string; deckName?: string; onCopy?: (deck: DeckListing) => void };

export function MatchOwnDeckAction({ matchId, deckName, onCopy }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deck, setDeck] = useState<UsedDeck>();

  async function openDeck() {
    setLoading(true);
    setFailed(false);
    try {
      setDeck(await accountApi.matchOwnDeck(matchId));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        className="profile-matches__deck-action"
        size="sm"
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={Boolean(deck)}
        aria-busy={loading}
        disabled={loading}
        onClick={() => void openDeck()}
      >
        <span className="profile-matches__action-icon" aria-hidden="true">
          <Icons.FileText size={15} />
        </span>
        <span className="profile-matches__deck-label">
          {loading ? t("common.loading") : (deckName ?? t("overlay.usedDeck"))}
        </span>
        <span className="profile-matches__action-icon" aria-hidden="true">
          <Icons.ChevronRight size={14} />
        </span>
      </Button>
      {failed ? <span role="alert">{t("profile.matchDeckFailed")}</span> : null}
      {deck ? <UsedDeckDialog snapshot={deck} onCopy={onCopy} onClose={() => setDeck(undefined)} /> : null}
    </>
  );
}
