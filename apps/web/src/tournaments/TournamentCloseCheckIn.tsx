import { useState } from "react";
import { Tooltip } from "radix-ui";
import type { TournamentStructure } from "@aegis/shared/tournaments/index";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { CloseCheckInOutcome } from "@/tournaments/CloseCheckInOutcome";
import { tournamentApi, type ApiError } from "@/tournaments/client";
import { getCloseCheckInOutcome } from "@/tournaments/getCloseCheckInOutcome";

type TournamentCloseCheckInParams = {
  id: string;
  structure: TournamentStructure;
  allowBots: boolean;
  checkedIn: number;
  waiting: number;
  onClosed: () => void;
  onError: (error: ApiError) => void;
};

export function TournamentCloseCheckIn({
  id,
  structure,
  allowBots,
  checkedIn,
  waiting,
  onClosed,
  onError,
}: TournamentCloseCheckInParams) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const outcome = getCloseCheckInOutcome({ structure, checkedIn });

  async function closeCheckIn() {
    setBusy(true);
    const result = await tournamentApi.closeCheckIn(id);
    setBusy(false);
    setConfirming(false);
    if (result.ok || result.error.code === "below_minimum") {
      onClosed();
      return;
    }
    onError(result.error);
  }

  if (outcome !== CloseCheckInOutcome.START.value) {
    const reason = t(
      outcome === CloseCheckInOutcome.CANCEL.value
        ? "tournaments.closeCheckIn.needsPlayer"
        : "tournaments.closeCheckIn.blocked",
    );
    return (
      <div className="tournaments-close-check-in" data-outcome={outcome}>
        <div>
          <b>{t("tournaments.detail.closeCheckIn")}</b>
          <p className="tournaments-close-check-in__counts">
            {t("tournaments.closeCheckIn.counts", { checkedIn, waiting })}
          </p>
          <p className="tournaments-note" id={`${id}-close-check-in-reason`}>
            {reason}
          </p>
        </div>
        <Tooltip.Provider delayDuration={150}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="tournaments-close-check-in__trigger" tabIndex={0}>
                <Button variant="secondary" size="sm" disabled aria-describedby={`${id}-close-check-in-reason`}>
                  {t("tournaments.detail.closeCheckIn")}
                </Button>
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="tournaments-tooltip" side="top" sideOffset={8} collisionPadding={12}>
                {reason}
                <Tooltip.Arrow className="tournaments-tooltip__arrow" width={12} height={6} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
    );
  }

  if (!confirming) {
    return (
      <div className="tournaments-close-check-in">
        <div>
          <b>{t("tournaments.detail.closeCheckIn")}</b>
          <p className="tournaments-note">{t("tournaments.closeCheckIn.hint")}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          {t("tournaments.detail.closeCheckIn")}
        </Button>
      </div>
    );
  }

  return (
    <div className="tournaments-close-check-in" data-confirming>
      <div className="tournaments-close-check-in__body">
        <b>{t("tournaments.closeCheckIn.confirmTitle")}</b>
        <p className="tournaments-close-check-in__counts">
          {t("tournaments.closeCheckIn.counts", { checkedIn, waiting })}
        </p>
        <ul>
          <li>{t("tournaments.closeCheckIn.starts")}</li>
          {waiting > 0 ? <li>{t("tournaments.closeCheckIn.noShows")}</li> : null}
          {structure === "single_elimination" && allowBots ? <li>{t("tournaments.closeCheckIn.bots")}</li> : null}
        </ul>
      </div>
      <div className="tournaments-detail__actions">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void closeCheckIn()}>
          {t("tournaments.closeCheckIn.confirmStart")}
        </Button>
      </div>
    </div>
  );
}
