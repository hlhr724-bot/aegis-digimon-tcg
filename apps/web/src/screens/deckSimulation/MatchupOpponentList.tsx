import type { CSSProperties } from "react";
import type { MatchupOpponentResult } from "@aegis/shared/deckSimulation/MatchupJob";
import { CoverThumb } from "@/design/cards";
import { COLORS, colorKey } from "@/design/theme";
import { useTranslation } from "@/i18n/useTranslation";
import type { MatchupDeckArt } from "@/screens/deckSimulation/MatchupDeckArt";
import { sortMatchupOpponents } from "@/screens/deckSimulation/sortMatchupOpponents";
import { verdictForInterval } from "@/screens/deckSimulation/verdictForInterval";
import { WinRateBand } from "@/screens/deckSimulation/WinRateBand";

interface MatchupOpponentListProps {
  opponents: readonly MatchupOpponentResult[];
  artFor: (opponent: MatchupOpponentResult) => MatchupDeckArt;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function MatchupOpponentList({ opponents, artFor }: MatchupOpponentListProps) {
  const { t } = useTranslation();
  return (
    <section className="deck-matchup__opponents" aria-labelledby="deck-matchup-opponents-title">
      <h4 id="deck-matchup-opponents-title" className="deck-sim__subhead">
        {t("deckMatchup.opponents.title")}
      </h4>
      <ul>
        {sortMatchupOpponents(opponents).map((opponent, index) => {
          const art = artFor(opponent);
          const verdict = opponent.interval === null ? undefined : verdictForInterval(opponent.interval);
          return (
            <li
              key={opponent.communityDeckId ?? `${opponent.name}-${index}`}
              className="deck-matchup__opponent"
              style={{ "--deck-color-soft": COLORS[colorKey(art.color)].soft } as CSSProperties}
            >
              <span className="deck-matchup__opponent-cover" aria-hidden="true">
                <CoverThumb coverCardId={art.coverCardId} sigilColor={colorKey(art.color)} sigilSize={28} />
              </span>
              <span className="deck-matchup__opponent-text">
                <span className="deck-matchup__opponent-name">{opponent.name}</span>
                <span className="deck-matchup__opponent-record">
                  {t("deckMatchup.record", { wins: opponent.wins, losses: opponent.losses, draws: opponent.draws })}
                  {opponent.completedGames < opponent.requestedGames
                    ? ` · ${t("deckMatchup.opponents.games", { done: opponent.completedGames, total: opponent.requestedGames })}`
                    : null}
                </span>
              </span>
              <span className="deck-matchup__opponent-band">
                {opponent.score === null || opponent.interval === null ? null : (
                  <WinRateBand score={opponent.score} interval={opponent.interval} compact />
                )}
              </span>
              <span className="deck-matchup__opponent-score">
                {opponent.score === null ? "–" : percent(opponent.score)}
              </span>
              {verdict === undefined ? (
                <span />
              ) : (
                <span className="deck-matchup__verdict-chip" data-verdict={verdict}>
                  {t(`deckMatchup.verdictShort.${verdict}`)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
