import { useState } from "react";
import { Alert, Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { tournamentApi, type ApiError } from "@/tournaments/client";
import { reasonKey } from "@/tournaments/labels";
import type { TournamentListing } from "@/tournaments/types";

type Props = {
  tournament: TournamentListing;
  canCheckIn: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
};

export function TournamentNextAction({ tournament, canCheckIn, onOpen, onChanged }: Props) {
  const { t, locale } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const active = tournament.myEntry?.status === "active";
  const deadline = canCheckIn ? tournament.myEntry?.checkInClosesAt : null;
  let detail = t("tournaments.catalog.awaitStart");
  let label = t("tournaments.catalog.view");
  if (active) {
    detail = t("tournaments.catalog.roundReady");
    label = t("tournaments.catalog.continue");
  } else if (canCheckIn) {
    detail = t("tournaments.catalog.checkInOpen");
    label = t("tournaments.detail.checkIn");
  } else if (tournament.myEntry?.status === "registered") {
    detail = t("tournaments.catalog.checkInPending");
  }

  async function handleAction() {
    if (!canCheckIn) {
      onOpen(tournament.id);
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await tournamentApi.checkIn(tournament.id);
    setBusy(false);
    if (result.ok) {
      onChanged();
    } else {
      setError(result.error);
    }
  }

  return (
    <section className="tournaments-next-action" aria-label={t("tournaments.catalog.nextStep")}>
      <span className="tournaments-next-action__icon" aria-hidden="true">
        <Icons.Trophy size={22} />
      </span>
      <div className="tournaments-next-action__copy">
        <span className="tournaments-eyebrow">{t("tournaments.catalog.nextStep")}</span>
        <h2>{tournament.name}</h2>
        <p>
          <Icons.ShieldCheck size={16} />
          {detail}
        </p>
      </div>
      <div className="tournaments-next-action__actions">
        {deadline ? (
          <span>
            <Icons.Clock size={15} />
            {t("tournaments.catalog.until", {
              time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(deadline),
            })}
          </span>
        ) : null}
        <Button disabled={busy} onClick={() => void handleAction()}>
          {label}
        </Button>
      </div>
      {error ? (
        <Alert tone="danger" title={t("tournaments.error.action")}>
          {t(reasonKey(error.code) ?? "tournaments.reason.unknown", { code: error.code })}
        </Alert>
      ) : null}
    </section>
  );
}
