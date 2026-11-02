import { Badge } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { getAgendaDayLabel } from "@/home/getAgendaDayLabel";
import { HomeCard } from "@/home/HomeCard";
import { useTranslation } from "@/i18n/useTranslation";
import { participantStatusKey, structureKey } from "@/tournaments/labels";
import type { TournamentListing } from "@/tournaments/types";

const HOME_AGENDA_COUNT = 3;
const CLOSED_STATUSES: readonly string[] = ["finished", "cancelled"];

type HomeAgendaCardParams = {
  tournaments: TournamentListing[] | undefined;
  accountId: string;
  onOpen: (id: string) => void;
  onViewAll: () => void;
};

export function HomeAgendaCard({ tournaments, accountId, onOpen, onViewAll }: HomeAgendaCardParams) {
  const { t, locale } = useTranslation();
  const now = Date.now();
  const agenda = (tournaments ?? [])
    .filter((tournament) => !CLOSED_STATUSES.includes(tournament.status))
    .filter((tournament) => tournament.myEntry || tournament.createdBy === accountId)
    .sort((first, second) => first.startsAt - second.startsAt)
    .slice(0, HOME_AGENDA_COUNT);
  if (agenda.length === 0) {
    return null;
  }
  return (
    <HomeCard
      className="home-agenda"
      title={t("home.agenda.title")}
      action={{ label: t("home.viewAll"), onClick: onViewAll }}
    >
      <ul className="home-agenda__list">
        {agenda.map((tournament) => {
          const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
            new Date(tournament.startsAt),
          );
          return (
            <li key={tournament.id} className="home-agenda__item">
              <time className="home-when" dateTime={new Date(tournament.startsAt).toISOString()}>
                <small>{getAgendaDayLabel({ startsAt: tournament.startsAt, now, locale, t })}</small>
                <b>{time}</b>
              </time>
              <div className="home-agenda__info">
                <h3>{tournament.name}</h3>
                <div className="home-facts">
                  <span>
                    {t(structureKey(tournament.structure))} · {t("tournaments.bestOf", { count: tournament.bestOf })}
                  </span>
                </div>
                {tournament.myEntry ? (
                  <Badge tone="success">{t(participantStatusKey(tournament.myEntry.status))}</Badge>
                ) : (
                  <Badge tone="primary">{t("home.agenda.organizer")}</Badge>
                )}
              </div>
              <button
                type="button"
                className="home-icon-link"
                aria-label={t("home.agenda.open", { name: tournament.name })}
                onClick={() => onOpen(tournament.id)}
              >
                <Icons.ChevronRight size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </HomeCard>
  );
}
