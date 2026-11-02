import { useEffect, useState } from "react";
import type { CommunityDeckSummary } from "@aegis/shared";
import { COMMUNITY_MATCHUP_LIMITS } from "@aegis/shared/deckSimulation/COMMUNITY_MATCHUP_LIMITS";
import { communityApi } from "@/community/client";
import { useTranslation } from "@/i18n/useTranslation";

interface CommunityOpponentPickerProps {
  selected: readonly string[];
  disabled: boolean;
  onChange: (deckIds: string[]) => void;
}

export function CommunityOpponentPicker({ selected, disabled, onChange }: CommunityOpponentPickerProps) {
  const { t } = useTranslation();
  const [decks, setDecks] = useState<CommunityDeckSummary[] | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    communityApi
      .browse({ sort: "top", period: "all", colors: [], search: "", page: 0 })
      .then((page) => {
        if (active) setDecks(page.decks.filter((deck) => deck.legal));
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = (deckId: string) =>
    onChange(selected.includes(deckId) ? selected.filter((id) => id !== deckId) : [...selected, deckId]);
  const full = selected.length >= COMMUNITY_MATCHUP_LIMITS.maxOpponents;

  return (
    <fieldset className="deck-matchup__community" disabled={disabled}>
      <legend className="deck-draw-odds__hint">
        {selected.length === 0
          ? t("deckMatchup.community.default", { count: COMMUNITY_MATCHUP_LIMITS.defaultOpponents })
          : t("deckMatchup.community.selected", {
              count: selected.length,
              max: COMMUNITY_MATCHUP_LIMITS.maxOpponents,
            })}
      </legend>
      {failed ? <p className="deck-draw-odds__hint">{t("deckMatchup.community.unavailable")}</p> : null}
      {decks === undefined && !failed ? (
        <p className="deck-draw-odds__hint">{t("deckMatchup.community.loading")}</p>
      ) : null}
      {decks !== undefined ? (
        <ul className="deck-matchup__community-list">
          {decks.map((deck) => (
            <li key={deck.id}>
              <label className="deck-draw-odds__check">
                <input
                  type="checkbox"
                  checked={selected.includes(deck.id)}
                  disabled={!selected.includes(deck.id) && full}
                  onChange={() => toggle(deck.id)}
                />
                {t("deckMatchup.community.deck", { name: deck.name, author: deck.author.displayName })}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
