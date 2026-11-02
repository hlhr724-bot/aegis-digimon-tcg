import type { ReactNode } from "react";
import { Icons } from "@/design/icons";
import { Button, Panel } from "@/design/primitives";
import type { DeckListing } from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";
import { formatTournamentDateTime } from "@/tournaments/formatTournamentDateTime";
import { formatTournamentTime } from "@/tournaments/formatTournamentTime";
import { TournamentCheckInCard } from "@/tournaments/TournamentCheckInCard";
import { TournamentDropControl } from "@/tournaments/TournamentDropControl";
import { TournamentEntryView, type TournamentEntryViewEntry } from "@/tournaments/TournamentEntryView";
import { TournamentRegisteredDeck } from "@/tournaments/TournamentRegisteredDeck";
import type { TournamentDetail } from "@/tournaments/types";

type TournamentEntryProgressParams = {
  detail: TournamentDetail;
  view: TournamentEntryViewEntry;
  decks: readonly DeckListing[];
  busy: boolean;
  canDrop: boolean;
  canChangeDeck: boolean;
  error: ReactNode;
  onCheckIn: () => void;
  onDrop: () => void;
  onDeckChanged: () => void;
  onDecks: () => void;
  onMyTournaments?: () => void;
};

export function TournamentEntryProgress({
  detail,
  view,
  decks,
  busy,
  canDrop,
  canChangeDeck,
  error,
  onCheckIn,
  onDrop,
  onDeckChanged,
  onDecks,
  onMyTournaments,
}: TournamentEntryProgressParams) {
  const { t, locale } = useTranslation();
  const checkInOpensAt = detail.windows?.checkInOpensAt ?? null;
  const checkInClosesAt = detail.windows?.checkInClosesAt ?? null;
  const myTournamentsButton = onMyTournaments ? (
    <Button variant="secondary" onClick={onMyTournaments}>
      {t("tournaments.catalog.mine")}
    </Button>
  ) : null;

  return (
    <>
      {view.value === TournamentEntryView.REGISTERED.value ? (
        <Panel className="tournaments-entry-hero">
          <span className="tournaments-entry-hero__icon" aria-hidden="true">
            <Icons.Check size={26} />
          </span>
          <div className="tournaments-entry-hero__body">
            <h2>{t("tournaments.signup.doneTitle")}</h2>
            <p>
              {checkInOpensAt !== null && checkInClosesAt !== null
                ? t("tournaments.signup.doneCopy", {
                    opens: formatTournamentDateTime({ epochMs: checkInOpensAt, locale }),
                    closes: formatTournamentTime({ epochMs: checkInClosesAt, locale }),
                  })
                : t("tournaments.detail.windowsPending")}
            </p>
            {myTournamentsButton}
          </div>
        </Panel>
      ) : null}

      {view.value === TournamentEntryView.CHECK_IN.value ? (
        <TournamentCheckInCard checkInClosesAt={checkInClosesAt} busy={busy} onCheckIn={onCheckIn} />
      ) : null}

      {view.value === TournamentEntryView.CHECKED_IN.value ? (
        <Panel className="tournaments-entry-hero">
          <span className="tournaments-entry-hero__icon" aria-hidden="true">
            <Icons.CircleCheck size={26} />
          </span>
          <div className="tournaments-entry-hero__body">
            <h2>{t("tournaments.signup.readyTitle")}</h2>
            <p>
              {t("tournaments.signup.readyCopy", {
                time: formatTournamentDateTime({ epochMs: detail.startsAt, locale }),
              })}
            </p>
            {myTournamentsButton}
          </div>
        </Panel>
      ) : null}

      {error}

      {detail.ownDeck ? (
        <Panel>
          <TournamentRegisteredDeck
            key={detail.id}
            tournamentId={detail.id}
            deck={detail.ownDeck}
            decks={decks}
            banlistCards={detail.banlistCards}
            canChange={canChangeDeck}
            onChanged={onDeckChanged}
            onDecks={onDecks}
          />
        </Panel>
      ) : null}

      {canDrop ? (
        <Panel className="tournaments-entry-drop">
          <div>
            <b>{t("tournaments.detail.drop")}</b>
            <p className="tournaments-note">{t("tournaments.signup.dropHint")}</p>
          </div>
          <TournamentDropControl tournamentName={detail.name} busy={busy} onDrop={onDrop} />
        </Panel>
      ) : null}
    </>
  );
}
