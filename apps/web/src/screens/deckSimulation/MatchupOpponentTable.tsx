import type { MatchupOpponentResult } from "@aegis/shared/deckSimulation/MatchupJob";
import { useTranslation } from "@/i18n/useTranslation";
import { sortMatchupOpponents } from "@/screens/deckSimulation/sortMatchupOpponents";

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
    <div className="deck-draw-odds__table-wrap">
      <table className="deck-draw-odds__table deck-matchup__table">
        <thead>
          <tr>
            <th scope="col">{t("deckMatchup.table.opponent")}</th>
            <th scope="col">{t("deckMatchup.table.score")}</th>
            <th scope="col">{t("deckMatchup.table.range")}</th>
            <th scope="col">{t("deckMatchup.table.games")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((opponent, index) => (
            <tr
              key={opponent.communityDeckId ?? `${opponent.name}-${index}`}
              data-standing={opponent === best ? "best" : opponent === worst ? "worst" : undefined}
            >
              <th scope="row">{opponent.name}</th>
              <td>{opponent.score === null ? "–" : percent(opponent.score)}</td>
              <td>
                {opponent.interval === null
                  ? "–"
                  : t("deckMatchup.table.rangeValue", {
                      low: percent(opponent.interval[0]),
                      high: percent(opponent.interval[1]),
                    })}
              </td>
              <td>
                {t("deckMatchup.table.gamesValue", { done: opponent.completedGames, total: opponent.requestedGames })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
