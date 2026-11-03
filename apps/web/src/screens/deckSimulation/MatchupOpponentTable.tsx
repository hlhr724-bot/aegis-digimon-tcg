import type { MatchupOpponentResult } from "@aegis/shared/deckSimulation/MatchupJob";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { sortMatchupOpponents } from "@/screens/deckSimulation/sortMatchupOpponents";
import { WinRateBand } from "@/screens/deckSimulation/WinRateBand";

interface MatchupOpponentTableProps {
  opponents: readonly MatchupOpponentResult[];
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function MatchupOpponentTable({ opponents }: MatchupOpponentTableProps) {
  const { t } = useTranslation();
  const sorted = sortMatchupOpponents(opponents);
  const scored = sorted.filter((opponent) => opponent.score !== null);
  const best = scored.length > 1 ? scored[0] : undefined;
  const worst = scored.length > 1 ? scored.at(-1) : undefined;
  return (
    <table className="deck-matchup__table">
      <thead>
        <tr>
          <th scope="col">{t("deckMatchup.table.opponent")}</th>
          <th scope="col">{t("deckMatchup.table.score")}</th>
          <th scope="col">{t("deckMatchup.table.range")}</th>
          <th scope="col">{t("deckMatchup.table.games")}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((opponent, index) => {
          const standing = opponent === best ? "best" : opponent === worst ? "worst" : undefined;
          return (
            <tr key={opponent.communityDeckId ?? `${opponent.name}-${index}`} data-standing={standing}>
              <th scope="row">{opponent.name}</th>
              <td className="deck-matchup__table-score">
                {standing === "best" ? (
                  <span className="deck-matchup__trend">
                    <Icons.ArrowUp size={12} />
                  </span>
                ) : null}
                {standing === "worst" ? (
                  <span className="deck-matchup__trend">
                    <Icons.ArrowDown size={12} />
                  </span>
                ) : null}
                {opponent.score === null ? "–" : percent(opponent.score)}
              </td>
              <td className="deck-matchup__table-range">
                {opponent.score === null || opponent.interval === null ? (
                  "–"
                ) : (
                  <>
                    <WinRateBand score={opponent.score} interval={opponent.interval} compact />
                    <span className="aegis-sr-only">
                      {t("deckMatchup.table.rangeValue", {
                        low: percent(opponent.interval[0]),
                        high: percent(opponent.interval[1]),
                      })}
                    </span>
                  </>
                )}
              </td>
              <td className="deck-matchup__table-games">
                {t("deckMatchup.table.gamesValue", { done: opponent.completedGames, total: opponent.requestedGames })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
