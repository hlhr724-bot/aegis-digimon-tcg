import { useState } from "react";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import type { DeckListing } from "@/game/decks";
import { UsedDeckDialog } from "@/game/UsedDeckDialog";
import { useTranslation } from "@/i18n/useTranslation";
import { accountApi } from "@/account/client";

type MatchOpponentDeckActionProps = {
  matchId: string;
  onCopy?: (deck: DeckListing) => void;
};

export function MatchOpponentDeckAction({ matchId, onCopy }: MatchOpponentDeckActionProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deck, setDeck] = useState<UsedDeck>();

  async function openDeck() {
    setLoading(true);
    setFailed(false);
    try {
      setDeck(await accountApi.matchOpponentDeck(matchId));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        className="profile-matches__opponent-deck-action"
        size="sm"
        variant="ghost"
        aria-label={t("overlay.viewOpponentDeck")}
        title={t("overlay.viewOpponentDeck")}
        aria-haspopup="dialog"
        aria-expanded={Boolean(deck)}
        aria-busy={loading}
        disabled={loading}
        onClick={() => void openDeck()}
      >
        <span className="profile-matches__action-icon" aria-hidden="true">
          <Icons.Eye size={14} />
        </span>
        {loading ? t("common.loading") : t("profile.deckStats.viewDeck")}
      </Button>
      {failed ? <span role="alert">{t("profile.opponentDeckFailed")}</span> : null}
      {deck ? <UsedDeckDialog snapshot={deck} opponent onCopy={onCopy} onClose={() => setDeck(undefined)} /> : null}
    </>
  );
}
