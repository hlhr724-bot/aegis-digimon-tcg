import { useId, useState } from "react";
import type { TournamentBanlistCard } from "@aegis/shared/tournaments/index";
import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import { Badge, Button } from "@/design/primitives";
import { displayCoverArt, displayCoverCard, type DeckListing } from "@/game/decks";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslation } from "@/i18n/useTranslation";
import { violationMessage } from "@/tournaments/labels";
import { tournamentDeckViolations } from "@/tournaments/tournamentDeckViolations";

type TournamentDeckPickerParams = {
  decks: readonly DeckListing[];
  banlistCards: readonly TournamentBanlistCard[];
  value: string;
  onChange: (deckId: string) => void;
  onDecks: () => void;
};

export function TournamentDeckPicker({ decks, banlistCards, value, onChange, onDecks }: TournamentDeckPickerParams) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const id = useId();
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const visible = decks
    .filter((deck) => deck.name.toLocaleLowerCase().includes(search))
    .map((deck) => ({ deck, violations: tournamentDeckViolations({ deck, banlistCards }) }))
    .sort((first, second) => Number(first.violations.length > 0) - Number(second.violations.length > 0));

  if (decks.length === 0) {
    return (
      <div className="tournaments-deck-empty">
        <span className="tournaments-deck-empty__icon" aria-hidden="true">
          <Icons.Cards size={20} />
        </span>
        <b>{t("tournaments.signup.noDecksTitle")}</b>
        <p>{t("tournaments.detail.needDeck")}</p>
        <Button size="sm" icon={Icons.Plus} onClick={onDecks}>
          {t("lobby.buildDeck")}
        </Button>
      </div>
    );
  }

  return (
    <fieldset className="tournaments-deck-picker">
      <legend className="aegis-sr-only">{t("tournaments.detail.deck")}</legend>
      <div className="tournaments-deck-picker__toolbar">
        <label className="tournaments-deck-picker__filter" htmlFor={`${id}-filter`}>
          <Icons.Search size={14} aria-hidden="true" />
          <span className="aegis-sr-only">{t("tournaments.detail.deckFilter")}</span>
          <input
            id={`${id}-filter`}
            type="search"
            autoComplete="off"
            value={query}
            placeholder={t("tournaments.detail.deckFilter")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className="tournaments-deck-picker__count">
          {t("tournaments.signup.deckCount", { count: visible.length })}
        </span>
      </div>
      <div className="tournaments-deck-picker__list">
        {visible.map(({ deck, violations }) => {
          const firstViolation = violations[0];
          const incomplete = violations.some(
            (violation) => violation.kind === "main_deck_size" || violation.kind === "egg_deck_size",
          );
          const issue = firstViolation ? violationMessage(firstViolation, getCardName) : undefined;
          return (
            <label
              key={deck.id}
              className="tournaments-deck-option"
              data-selected={deck.id === value || undefined}
              data-disabled={issue ? true : undefined}
            >
              <span className="tournaments-deck-option__cover" aria-hidden="true">
                <CoverThumb
                  coverCardId={displayCoverCard(deck)}
                  artId={displayCoverArt(deck)}
                  sigilColor={deck.color}
                  sigilSize={32}
                />
              </span>
              <span className="tournaments-deck-option__copy">
                <b>{deck.name}</b>
                {issue ? (
                  <span className="tournaments-deck-option__issue">{t(issue.key, issue.params)}</span>
                ) : (
                  <small>{t("lobby.famousDeckCards", { main: deck.mainDeck.length, egg: deck.eggDeck.length })}</small>
                )}
              </span>
              {issue ? (
                <Badge tone={incomplete ? "neutral" : "danger"}>
                  {t(incomplete ? "tournaments.signup.deckIncomplete" : "tournaments.signup.deckIllegal")}
                </Badge>
              ) : null}
              <input
                type="radio"
                name={`${id}-deck`}
                value={deck.id}
                checked={deck.id === value}
                disabled={issue !== undefined}
                onChange={() => onChange(deck.id)}
              />
            </label>
          );
        })}
        {visible.length === 0 ? (
          <div className="tournaments-deck-empty">
            <span className="tournaments-deck-empty__icon" aria-hidden="true">
              <Icons.Search size={20} />
            </span>
            <p>{t("tournaments.detail.deckFilterEmpty")}</p>
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}
