import { TournamentCategoryBadge } from "@/tournaments/TournamentCategoryBadge";
import { Badge, Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { getAgendaDayLabel } from "@/home/getAgendaDayLabel";
import { useTranslation } from "@/i18n/useTranslation";
import { deckFormatLabel } from "@/screens/deckFormatLabel";
import { formatTournamentTime } from "@/tournaments/formatTournamentTime";
import { isTournamentClosed } from "@/tournaments/isTournamentClosed";
import { banlistModeKey, statusKey, structureKey } from "@/tournaments/labels";
import { serverNow } from "@/tournaments/serverClock";
import type { TournamentListing } from "@/tournaments/types";

type TournamentAgendaItemParams = { tournament: TournamentListing; onOpen: (id: string) => void };

export function TournamentAgendaItem({ tournament, onOpen }: TournamentAgendaItemParams) {
  const { t, locale } = useTranslation();
  const date = new Date(tournament.startsAt);
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(date);
  const capacity = Math.min(100, Math.max(0, (tournament.registeredCount / tournament.maxPlayers) * 100));
  const closed = isTournamentClosed(tournament);
  const full = tournament.registeredCount >= tournament.maxPlayers;

  return (
    <li>
      <article className="tournaments-row">
        <time className="tournaments-when" dateTime={date.toISOString()} aria-label={fullDate}>
          <small>{getAgendaDayLabel({ startsAt: tournament.startsAt, now: serverNow(), locale, t })}</small>
          <b>{formatTournamentTime({ epochMs: tournament.startsAt, locale })}</b>
        </time>
        <div className="tournaments-row__info">
          <div className="tournaments-row__title">
            <h4>{tournament.name}</h4>
            <TournamentCategoryBadge category={tournament.category} explained={false} />
            {tournament.circuitId ? <Badge tone="primary">{t("tournaments.circuits.badge")}</Badge> : null}
            {tournament.passwordProtected ? (
              <span className="tournaments-row__lock">
                <Icons.Lock size={13} aria-hidden="true" />
                {t("tournaments.catalog.withPassword")}
              </span>
            ) : null}
          </div>
          <p className="tournaments-facts">
            <span>{deckFormatLabel(tournament.format ?? "standard", t)}</span>
            <span>
              <span>{t(structureKey(tournament.structure))}</span>
              {tournament.topCutEnabled ? (
                <>
                  {" "}
                  + <span>{t("tournaments.badge.topCut")}</span>
                </>
              ) : null}
            </span>
            <span>{t("tournaments.bestOf", { count: tournament.bestOf })}</span>
            {tournament.allowBots ? <span>{t("tournaments.badge.bots")}</span> : null}
            <span>
              {tournament.banlistPolicy.mode === "as_of_set"
                ? t("tournaments.banlist.asOfSet", { set: tournament.banlistPolicy.setId })
                : t(banlistModeKey(tournament.banlistPolicy))}
            </span>
          </p>
          {tournament.description ? (
            <p className="tournaments-row__description tournaments-description">{tournament.description}</p>
          ) : null}
        </div>
        <div className="tournaments-row__status">
          <Badge tone={closed ? "neutral" : "success"}>{t(statusKey(tournament.status))}</Badge>
          <span className="tournaments-row__slots">
            {t("tournaments.slots", { registered: tournament.registeredCount, max: tournament.maxPlayers })}
          </span>
          <span className="tournaments-progress" aria-hidden="true">
            <span style={{ width: `${capacity}%` }} />
          </span>
        </div>
        <Button className="tournaments-row__open" size="sm" variant="secondary" onClick={() => onOpen(tournament.id)}>
          {full && tournament.status === "registration" ? t("tournaments.catalog.full") : t("tournaments.catalog.view")}
        </Button>
      </article>
    </li>
  );
}
