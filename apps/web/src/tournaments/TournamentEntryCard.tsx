import type { ReactNode } from "react";
import type { ParticipantView } from "@aegis/shared/tournaments/index";
import { AccountPanel } from "@/account/AccountPanel";
import { Icons } from "@/design/icons";
import { Button, Panel } from "@/design/primitives";
import type { DeckListing } from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";
import type { EntryActions } from "@/tournaments/entry";
import { formatTournamentDateTime } from "@/tournaments/formatTournamentDateTime";
import { participantStatusKey } from "@/tournaments/labels";
import { TournamentDropControl } from "@/tournaments/TournamentDropControl";
import { TournamentEntryView, type TournamentEntryViewEntry } from "@/tournaments/TournamentEntryView";
import { TournamentRegisteredDeck } from "@/tournaments/TournamentRegisteredDeck";
import type { TournamentDetail } from "@/tournaments/types";

type TournamentEntryCardParams = {
  detail: TournamentDetail;
  own: ParticipantView | undefined;
  view: TournamentEntryViewEntry;
  actions: EntryActions;
  decks: readonly DeckListing[];
  busy: boolean;
  error: ReactNode;
  onSignUp: () => void;
  onDrop: () => void;
  onDeckChanged: () => void;
  onDecks: () => void;
};

const CLOSED_STATUSES: readonly TournamentDetail["status"][] = ["check_in", "running"];

export function TournamentEntryCard({
  detail,
  own,
  view,
  actions,
  decks,
  busy,
  error,
  onSignUp,
  onDrop,
  onDeckChanged,
  onDecks,
}: TournamentEntryCardParams) {
  const { t, locale } = useTranslation();
  const spotsLeft = Math.max(0, detail.maxPlayers - detail.registeredCount);
  const capacity = Math.min(100, Math.max(0, (detail.registeredCount / detail.maxPlayers) * 100));
  const registrationClosesAt = detail.windows?.registrationClosesAt ?? null;
  const full = detail.registeredCount >= detail.maxPlayers;
  const signUpClosed = !actions.drop && CLOSED_STATUSES.includes(detail.status);
  const signUpFull = !actions.drop && detail.status === "registration" && full;

  return (
    <Panel className="tournaments-entry">
      <h3>{t("tournaments.detail.actions")}</h3>
      <div className="tournaments-capacity">
        <div className="tournaments-capacity__label">
          <span>{t("tournaments.slotsLabel")}</span>
          <span>
            <b>{detail.registeredCount}</b> / {detail.maxPlayers} ·{" "}
            {t("tournaments.detail.spotsLeft", { count: spotsLeft })}
          </span>
        </div>
        <span className="tournaments-progress" aria-hidden="true">
          <span style={{ width: `${capacity}%` }} />
        </span>
      </div>

      {view.value === TournamentEntryView.SIGNED_OUT.value ? (
        <div className="tournaments-detail__signin">
          <p>{t("tournaments.detail.signInRequired")}</p>
          <AccountPanel account={null} />
        </div>
      ) : null}

      {view.value === TournamentEntryView.OPEN.value ? (
        <div className="tournaments-signup">
          {detail.passwordProtected ? (
            <p className="tournaments-callout">
              <Icons.Lock size={15} aria-hidden="true" />
              {t("tournaments.detail.passwordNote")}
            </p>
          ) : null}
          <Button size="lg" full onClick={onSignUp}>
            {t("tournaments.detail.register")}
          </Button>
          {registrationClosesAt !== null ? (
            <p className="tournaments-note tournaments-signup__closes">
              {t("tournaments.detail.registrationCloses", {
                time: formatTournamentDateTime({ epochMs: registrationClosesAt, locale }),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {view.value === TournamentEntryView.SUMMARY.value ? (
        <>
          {own ? (
            <p className="tournaments-entry__status" data-status={own.status}>
              <Icons.CircleCheck size={16} aria-hidden="true" />
              {t("tournaments.detail.yourStatus", { status: t(participantStatusKey(own.status)) })}
            </p>
          ) : null}
          {own && detail.ownDeck ? (
            <TournamentRegisteredDeck
              key={detail.id}
              tournamentId={detail.id}
              deck={detail.ownDeck}
              decks={decks}
              banlistCards={detail.banlistCards}
              canChange={own.status === "registered" || own.status === "checked_in"}
              onChanged={onDeckChanged}
              onDecks={onDecks}
            />
          ) : null}
          {actions.drop ? <TournamentDropControl tournamentName={detail.name} busy={busy} onDrop={onDrop} /> : null}
          {signUpClosed ? (
            <p className="tournaments-callout" data-tone="warning">
              <Icons.Lock size={15} aria-hidden="true" />
              {t("tournaments.signup.closed")}
            </p>
          ) : null}
          {signUpFull ? (
            <p className="tournaments-callout" data-tone="warning">
              <Icons.Users size={15} aria-hidden="true" />
              {t("tournaments.reason.tournamentFull")}
            </p>
          ) : null}
          {!actions.drop && !signUpClosed && !signUpFull ? (
            <p className="tournaments-note">{t("tournaments.detail.noActions")}</p>
          ) : null}
        </>
      ) : null}

      {error}
    </Panel>
  );
}
