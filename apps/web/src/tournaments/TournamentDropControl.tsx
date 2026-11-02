import { useState } from "react";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";

type TournamentDropControlParams = {
  tournamentName: string;
  busy: boolean;
  onDrop: () => void;
};

export function TournamentDropControl({ tournamentName, busy, onDrop }: TournamentDropControlParams) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        className="tournaments-entry__drop"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {t("tournaments.detail.drop")}
      </Button>
    );
  }

  return (
    <div className="tournaments-confirm" role="group" aria-label={t("tournaments.detail.drop")}>
      <b>{t("tournaments.detail.dropConfirm", { name: tournamentName })}</b>
      <p>{t("tournaments.detail.dropConfirmCopy")}</p>
      <div className="tournaments-detail__actions">
        <Button
          variant="danger"
          size="sm"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            onDrop();
          }}
        >
          {t("tournaments.detail.dropConfirmYes")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
