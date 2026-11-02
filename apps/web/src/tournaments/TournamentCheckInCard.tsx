import { useId } from "react";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { useCountdown } from "@/tournaments/hooks";

type TournamentCheckInCardParams = {
  checkInClosesAt: number | null;
  busy: boolean;
  onCheckIn: () => void;
};

export function TournamentCheckInCard({ checkInClosesAt, busy, onCheckIn }: TournamentCheckInCardParams) {
  const { t } = useTranslation();
  const countdown = useCountdown(checkInClosesAt);
  const titleId = useId();

  return (
    <section className="tournaments-checkin" aria-labelledby={titleId}>
      <div>
        <small>{t("tournaments.catalog.checkInOpen")}</small>
        <h3 id={titleId}>{t("tournaments.signup.checkInTitle")}</h3>
        {checkInClosesAt !== null ? (
          <>
            <strong className="tournaments-checkin__countdown" role="timer" aria-live="off">
              {countdown.text}
            </strong>
            <small>{t("tournaments.signup.checkInLeft")}</small>
          </>
        ) : null}
      </div>
      <Button size="lg" icon={Icons.Check} disabled={busy} onClick={onCheckIn}>
        {t("tournaments.detail.checkIn")}
      </Button>
    </section>
  );
}
