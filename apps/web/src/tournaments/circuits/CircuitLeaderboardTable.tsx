import { useId } from "react";
import type {
  TournamentCircuitLeaderboard,
  TournamentCircuitStanding,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { Badge, Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";

type Props = {
  leaderboard: TournamentCircuitLeaderboard | undefined;
  onPage: (page: number) => void;
};

const PAGE_SIZE = 50;

export function CircuitLeaderboardTable({ leaderboard, onPage }: Props) {
  const { t, locale } = useTranslation();
  const headingId = useId();
  const pages = leaderboard ? Math.max(1, Math.ceil(leaderboard.total / PAGE_SIZE)) : 1;
  const mineOutsidePage =
    leaderboard?.mine && !leaderboard.entries.some((entry) => entry.accountId === leaderboard.mine?.accountId);
  return (
    <section className="circuit-leaderboard" aria-labelledby={headingId}>
      <header className="circuit-leaderboard__header">
        <h2 id={headingId}>
          <Icons.Trophy size={18} />
          {t("tournaments.circuits.leaderboard")}
        </h2>
        {leaderboard?.final ? <Badge tone="primary">{t("tournaments.circuits.final")}</Badge> : null}
      </header>
      {!leaderboard ? <p role="status">{t("common.loading")}</p> : null}
      {leaderboard && leaderboard.total === 0 ? (
        <p className="circuit-leaderboard__empty">{t("tournaments.circuits.leaderboardEmpty")}</p>
      ) : null}
      {leaderboard && leaderboard.total > 0 ? (
        <div className="circuit-leaderboard__scroll">
          <table className="circuit-leaderboard__table">
            <thead>
              <tr>
                <th scope="col">{t("tournaments.circuits.column.position")}</th>
                <th scope="col">{t("tournaments.circuits.column.player")}</th>
                <th scope="col">{t("tournaments.circuits.column.points")}</th>
                <th scope="col">{t("tournaments.circuits.column.events")}</th>
                <th scope="col">{t("tournaments.circuits.column.best")}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.entries.map((entry) => (
                <LeaderboardRow
                  key={entry.accountId}
                  entry={entry}
                  mine={entry.accountId === leaderboard.mine?.accountId}
                  locale={locale}
                />
              ))}
            </tbody>
            {mineOutsidePage && leaderboard.mine ? (
              <tfoot>
                <LeaderboardRow entry={leaderboard.mine} mine locale={locale} />
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
      {leaderboard && pages > 1 ? (
        <nav className="circuit-leaderboard__pages" aria-label={t("tournaments.circuits.pages")}>
          <Button
            variant="ghost"
            size="sm"
            icon={Icons.ChevronLeft}
            disabled={leaderboard.page <= 1}
            onClick={() => onPage(leaderboard.page - 1)}
          >
            {t("tournaments.circuits.previous")}
          </Button>
          <span>{t("tournaments.circuits.page", { page: leaderboard.page, pages })}</span>
          <Button
            variant="ghost"
            size="sm"
            icon={Icons.ChevronRight}
            disabled={leaderboard.page >= pages}
            onClick={() => onPage(leaderboard.page + 1)}
          >
            {t("tournaments.circuits.nextPage")}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}

function LeaderboardRow({ entry, mine, locale }: { entry: TournamentCircuitStanding; mine: boolean; locale: string }) {
  return (
    <tr className={mine ? "is-mine" : undefined} data-podium={entry.position <= 3 ? entry.position : undefined}>
      <td>{entry.position}</td>
      <th scope="row">{entry.displayName}</th>
      <td>{entry.points.toLocaleString(locale)}</td>
      <td>{entry.events.toLocaleString(locale)}</td>
      <td>{entry.bestPlacement === null ? "—" : `#${entry.bestPlacement}`}</td>
    </tr>
  );
}
