import type { ParticipantView } from "@aegis/shared/tournaments/index";
import { Icons } from "@/design/icons";
import { Panel } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { describeCheckInWindow } from "@/tournaments/describeCheckInWindow";
import { describeTournamentStructure } from "@/tournaments/describeTournamentStructure";
import { formatTournamentDateTime } from "@/tournaments/formatTournamentDateTime";
import { participantStatusKey } from "@/tournaments/labels";
import type { TournamentDetail } from "@/tournaments/types";

type TournamentEntrySummaryParams = {
  detail: TournamentDetail;
  own: ParticipantView | undefined;
};

export function TournamentEntrySummary({ detail, own }: TournamentEntrySummaryParams) {
  const { t, locale } = useTranslation();
  const checkInWindow = describeCheckInWindow({ windows: detail.windows, locale, t });

  return (
    <Panel className="tournaments-entry">
      <h3>{t("tournaments.detail.actions")}</h3>
      <div className="tournaments-entry-event">
        <b>{detail.name}</b>
        <span>
          <Icons.Calendar size={13} aria-hidden="true" />
          {formatTournamentDateTime({ epochMs: detail.startsAt, locale })}
        </span>
      </div>
      {own ? (
        <p className="tournaments-entry__status" data-status={own.status}>
          <Icons.CircleCheck size={16} aria-hidden="true" />
          {t("tournaments.detail.yourStatus", { status: t(participantStatusKey(own.status)) })}
        </p>
      ) : null}
      <dl className="tournaments-signup-summary tournaments-signup-summary--compact">
        <div>
          <dt>{t("tournaments.detail.format")}</dt>
          <dd>{describeTournamentStructure({ detail, t })}</dd>
        </div>
        <div>
          <dt>{t("tournaments.create.bestOf")}</dt>
          <dd>{t("tournaments.bestOf", { count: detail.bestOf })}</dd>
        </div>
        {checkInWindow ? (
          <div>
            <dt>{t("tournaments.status.check_in")}</dt>
            <dd>{checkInWindow}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("tournaments.slotsLabel")}</dt>
          <dd>{t("tournaments.slots", { registered: detail.registeredCount, max: detail.maxPlayers })}</dd>
        </div>
      </dl>
    </Panel>
  );
}
