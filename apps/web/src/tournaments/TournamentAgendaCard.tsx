import { Badge } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { getAgendaDayLabel } from "@/home/getAgendaDayLabel";
import { useTranslation } from "@/i18n/useTranslation";
import { formatTournamentTime } from "@/tournaments/formatTournamentTime";
import { participantStatusKey, structureKey } from "@/tournaments/labels";
import { serverNow } from "@/tournaments/serverClock";
import type { TournamentListing } from "@/tournaments/types";

type TournamentAgendaCardParams = {
  tournaments: readonly TournamentListing[];
  onOpen: (id: string) => void;
};

export function TournamentAgendaCard({ tournaments, onOpen }: TournamentAgendaCardParams) {
  const { t, locale } = useTranslation();
  const now = serverNow();
  return (
    <section className="tournaments-card tournaments-agenda-card">
      <header className="tournaments-card__header">
        <h2 className="tournaments-card__title">{t("home.agenda.title")}</h2>
      </header>
      <ul className="tournaments-card__content tournaments-agenda-list">
        {tournaments.map((tournament) => {
          const checkInOpensAt = tournament.myEntry?.checkInOpensAt ?? null;
          return (
            <li key={tournament.id} className="tournaments-agenda-entry">
              <time className="tournaments-when" dateTime={new Date(tournament.startsAt).toISOString()}>
                <small>{getAgendaDayLabel({ startsAt: tournament.startsAt, now, locale, t })}</small>
                <b>{formatTournamentTime({ epochMs: tournament.startsAt, locale })}</b>
              </time>
              <div className="tournaments-agenda-entry__info">
                <strong>{tournament.name}</strong>
                <span className="tournaments-agenda-entry__fact">
                  {checkInOpensAt !== null && checkInOpensAt > now
                    ? `${t("tournaments.detail.window.checkInOpensAt")} ${formatTournamentTime({ epochMs: checkInOpensAt, locale })}`
                    : `${t(structureKey(tournament.structure))} · ${t("tournaments.bestOf", { count: tournament.bestOf })}`}
                </span>
                {tournament.myEntry ? (
                  <Badge tone="success">{t(participantStatusKey(tournament.myEntry.status))}</Badge>
                ) : (
                  <Badge tone="primary">{t("home.agenda.organizer")}</Badge>
                )}
              </div>
              <button
                type="button"
                className="tournaments-icon-link"
                aria-label={t("home.agenda.open", { name: tournament.name })}
                onClick={() => onOpen(tournament.id)}
              >
                <Icons.ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
