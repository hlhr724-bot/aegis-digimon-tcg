import { useState } from "react";
import type { RankedPlayerDeck } from "@aegis/shared/ranked/RankedPlayerDeck";
import { useTranslation } from "@/i18n/useTranslation";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";
import { formatRatingChange } from "@/ranked/formatRatingChange";
import { RankedDeckCardList } from "@/ranked/RankedDeckCardList";
import { Button } from "@/design/primitives";

type Props = { accountId: string; seasonId: number; format: string };
type DeckProps = { deck: RankedPlayerDeck };
const HISTORY_PAGE_SIZE = 10;

export function RankedPlayerDecks({ accountId, seasonId, format }: Props) {
  const { t } = useTranslation();
  const query = new URLSearchParams({ season: String(seasonId), format });
  const { data, error, refresh } = useRankedRequest<RankedPlayerDeck[]>(
    `/ranked/players/${encodeURIComponent(accountId)}/decks?${query}`,
  );
  return (
    <section className="ranked-player-decks" aria-label={t("ranked.deck.title")}>
      <h3>{t("ranked.deck.title")}</h3>
      {error ? (
        <p role="alert">
          {t("ranked.season.error")}{" "}
          <Button size="sm" variant="secondary" onClick={refresh}>
            {t("ranked.season.retry")}
          </Button>
        </p>
      ) : null}
      {!data && !error ? <p role="status">{t("common.loading")}</p> : null}
      {data?.length === 0 ? <p className="ranked-muted">{t("ranked.deck.empty")}</p> : null}
      {data?.map((deck) => (
        <RankedPlayerDeckCard key={deck.id} deck={deck} />
      ))}
    </section>
  );
}

function RankedPlayerDeckCard({ deck }: DeckProps) {
  const { t, locale } = useTranslation();
  const [visible, setVisible] = useState(HISTORY_PAGE_SIZE);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  return (
    <article className="ranked-player-deck">
      <header>
        <div>
          <h4>{deck.name}</h4>
          {deck.archetype && deck.archetype !== deck.name ? <p className="ranked-muted">{deck.archetype}</p> : null}
        </div>
        <strong className="ranked-player-deck__rate">
          {formatRankedWinrate({ value: deck.winrate, locale })}
          <small>{t("ranked.season.winrate")}</small>
        </strong>
      </header>
      <dl className="ranked-player-deck__stats">
        <div>
          <dt>{t("ranked.deck.games")}</dt>
          <dd>{deck.matches.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>{t("ranked.season.record")}</dt>
          <dd>
            {deck.wins} / {deck.losses} / {deck.draws}
          </dd>
        </div>
        <div>
          <dt>{t("ranked.deck.lastPlayed")}</dt>
          <dd>{date.format(deck.lastPlayedAt)}</dd>
        </div>
      </dl>
      {deck.matches < 10 ? <p className="ranked-muted">{t("ranked.deck.smallSample")}</p> : null}
      {deck.list ? (
        <details className="ranked-player-deck__details">
          <summary>{t("ranked.deck.viewList")}</summary>
          <RankedDeckCardList
            cards={deck.list.eggDeck}
            title={t("deck.eggSection", { count: deck.list.eggDeck.length })}
          />
          <RankedDeckCardList
            cards={deck.list.mainDeck}
            title={t("deck.mainSection", { count: deck.list.mainDeck.length })}
          />
        </details>
      ) : (
        <p className="ranked-muted">{t("ranked.deck.unpublished")}</p>
      )}
      <details className="ranked-player-deck__details">
        <summary>{t("ranked.deck.history")}</summary>
        <ul className="ranked-player-deck__history">
          {deck.history.slice(0, visible).map((match) => (
            <li key={match.matchId}>
              <span data-result={match.result}>{t(`ranked.deck.result.${match.result}`)}</span>
              <span>
                {match.opponentName}
                <small>{date.format(match.finishedAt)}</small>
              </span>
              <strong>{match.ratingChange === null ? "—" : formatRatingChange(match.ratingChange)}</strong>
            </li>
          ))}
        </ul>
        {visible < deck.history.length ? (
          <Button variant="ghost" size="sm" onClick={() => setVisible((count) => count + HISTORY_PAGE_SIZE)}>
            {t("ranked.deck.showMore")}
          </Button>
        ) : null}
      </details>
    </article>
  );
}
