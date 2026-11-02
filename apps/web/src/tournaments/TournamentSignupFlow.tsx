import { useEffect, useState } from "react";
import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import { Button, Field, Panel } from "@/design/primitives";
import { displayCoverArt, displayCoverCard, type DeckListing } from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";
import { tournamentApi, type ApiError } from "@/tournaments/client";
import { describeCheckInWindow } from "@/tournaments/describeCheckInWindow";
import { describeTournamentStructure } from "@/tournaments/describeTournamentStructure";
import { formatTournamentDateTime } from "@/tournaments/formatTournamentDateTime";
import { formatTournamentTime } from "@/tournaments/formatTournamentTime";
import { TournamentActionError } from "@/tournaments/TournamentActionError";
import { TournamentDeckPicker } from "@/tournaments/TournamentDeckPicker";
import { tournamentDeckViolations } from "@/tournaments/tournamentDeckViolations";
import { TournamentSignupStep } from "@/tournaments/TournamentSignupStep";
import type { TournamentDetail } from "@/tournaments/types";

type TournamentSignupFlowParams = {
  detail: TournamentDetail;
  decks: readonly DeckListing[];
  onDecks: () => void;
  onCancel: () => void;
  onRegistered: () => Promise<void>;
};

const PASSWORD_ERRORS: readonly string[] = ["incorrect_password"];
const DECK_ERRORS: readonly string[] = ["deck_illegal", "deck_not_found"];

export function TournamentSignupFlow({ detail, decks, onDecks, onCancel, onRegistered }: TournamentSignupFlowParams) {
  const { t, locale } = useTranslation();
  const steps = detail.passwordProtected
    ? [TournamentSignupStep.PASSWORD, TournamentSignupStep.DECK, TournamentSignupStep.REVIEW]
    : [TournamentSignupStep.DECK, TournamentSignupStep.REVIEW];
  const [step, setStep] = useState<TournamentSignupStep>(steps[0]!.value);
  const [password, setPassword] = useState("");
  const [deckId, setDeckId] = useState(() => findFirstLegalDeckId({ decks, detail }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  useEffect(() => {
    if (!deckId) {
      setDeckId(findFirstLegalDeckId({ decks, detail }));
    }
  }, [deckId, decks, detail]);

  const stepIndex = steps.findIndex((entry) => entry.value === step);
  const deck = decks.find((entry) => entry.id === deckId);
  const deckLegal =
    deck !== undefined && tournamentDeckViolations({ deck, banlistCards: detail.banlistCards }).length === 0;
  const checkInClosesAt = detail.windows?.checkInClosesAt ?? null;
  const checkInWindow = describeCheckInWindow({ windows: detail.windows, locale, t });

  function goTo(next: TournamentSignupStep) {
    setError(undefined);
    setStep(next);
  }

  function goBack() {
    const previous = steps[stepIndex - 1];
    if (previous) {
      goTo(previous.value);
      return;
    }
    onCancel();
  }

  function goForward() {
    const next = steps[stepIndex + 1];
    if (next) {
      goTo(next.value);
    }
  }

  async function register() {
    setBusy(true);
    setError(undefined);
    const result = await tournamentApi.register(detail.id, deckId, password);
    if (result.ok) {
      await onRegistered();
      return;
    }
    setBusy(false);
    setError(result.error);
    if (PASSWORD_ERRORS.includes(result.error.code) && detail.passwordProtected) {
      setStep(TournamentSignupStep.PASSWORD.value);
    } else if (DECK_ERRORS.includes(result.error.code)) {
      setStep(TournamentSignupStep.DECK.value);
    }
  }

  const canContinue =
    (step === TournamentSignupStep.PASSWORD.value && password.trim() !== "") ||
    (step === TournamentSignupStep.DECK.value && deckLegal);

  return (
    <section className="tournaments-signup-flow" aria-label={t("tournaments.detail.register")}>
      <ol className="tournaments-signup-steps" aria-label={t("tournaments.signup.steps")}>
        {steps.map((entry, index) => (
          <li
            key={entry.value}
            data-state={getStepState({ index, current: stepIndex })}
            aria-current={index === stepIndex ? "step" : undefined}
          >
            <span>{t(entry.labelKey)}</span>
          </li>
        ))}
      </ol>

      <Panel className="tournaments-signup-card">
        {step === TournamentSignupStep.PASSWORD.value ? (
          <>
            <header className="tournaments-signup-card__head">
              <h3>{t("tournaments.signup.passwordTitle")}</h3>
              <p>{t("tournaments.detail.passwordNote")}</p>
            </header>
            <Field
              className="tournaments-signup__password"
              label={t("tournaments.detail.password")}
              type="password"
              autoComplete="off"
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </>
        ) : null}

        {step === TournamentSignupStep.DECK.value ? (
          <>
            <header className="tournaments-signup-card__head">
              <div>
                <h3>{t("tournaments.signup.deckTitle")}</h3>
                <p>{t("tournaments.signup.deckHint")}</p>
              </div>
              {decks.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={onDecks}>
                  {t("tournaments.deck.editLibrary")}
                </Button>
              ) : null}
            </header>
            <TournamentDeckPicker
              decks={decks}
              banlistCards={detail.banlistCards}
              value={deckId}
              onChange={setDeckId}
              onDecks={onDecks}
            />
            {decks.length > 0 ? (
              <p className="tournaments-callout">
                <Icons.Clock size={15} aria-hidden="true" />
                {checkInClosesAt === null
                  ? t("tournaments.deck.editable")
                  : t("tournaments.signup.changeUntil", {
                      time: formatTournamentTime({ epochMs: checkInClosesAt, locale }),
                    })}
              </p>
            ) : null}
          </>
        ) : null}

        {step === TournamentSignupStep.REVIEW.value ? (
          <>
            <header className="tournaments-signup-card__head">
              <h3>{t("tournaments.signup.reviewTitle")}</h3>
              <p>{t("tournaments.signup.reviewHint")}</p>
            </header>
            {deck ? (
              <div className="tournaments-signup-deck">
                <span className="tournaments-deck-option__cover" aria-hidden="true">
                  <CoverThumb
                    coverCardId={displayCoverCard(deck)}
                    artId={displayCoverArt(deck)}
                    sigilColor={deck.color}
                    sigilSize={32}
                  />
                </span>
                <span className="tournaments-deck-option__copy">
                  <b>{deck.name}</b>
                  <small>{t("lobby.famousDeckCards", { main: deck.mainDeck.length, egg: deck.eggDeck.length })}</small>
                </span>
                <Button variant="ghost" size="sm" onClick={() => goTo(TournamentSignupStep.DECK.value)}>
                  {t("home.next.change")}
                </Button>
              </div>
            ) : null}
            <dl className="tournaments-signup-summary">
              <div>
                <dt>{t("tournaments.signup.event")}</dt>
                <dd>{detail.name}</dd>
              </div>
              <div>
                <dt>{t("tournaments.startsAt")}</dt>
                <dd>{formatTournamentDateTime({ epochMs: detail.startsAt, locale })}</dd>
              </div>
              {checkInWindow ? (
                <div>
                  <dt>{t("tournaments.status.check_in")}</dt>
                  <dd>{checkInWindow}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t("tournaments.detail.format")}</dt>
                <dd>
                  {describeTournamentStructure({ detail, t })} · {t("tournaments.bestOf", { count: detail.bestOf })}
                </dd>
              </div>
              {detail.passwordProtected ? (
                <div>
                  <dt>{t("tournaments.detail.password")}</dt>
                  <dd data-tone="success">{t("tournaments.signup.passwordEntered")}</dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : null}

        {error ? <TournamentActionError error={error} /> : null}

        <div className="tournaments-signup-card__actions">
          <Button variant="ghost" disabled={busy} onClick={goBack}>
            {t("mobile.back")}
          </Button>
          {step === TournamentSignupStep.REVIEW.value ? (
            <Button size="lg" icon={Icons.Check} disabled={busy || !deck} onClick={() => void register()}>
              {t("tournaments.signup.confirm")}
            </Button>
          ) : (
            <Button size="lg" disabled={!canContinue} onClick={goForward}>
              {t("overlay.continue")}
            </Button>
          )}
        </div>
      </Panel>
    </section>
  );
}

function findFirstLegalDeckId({ decks, detail }: { decks: readonly DeckListing[]; detail: TournamentDetail }): string {
  const legal = decks.find(
    (deck) => tournamentDeckViolations({ deck, banlistCards: detail.banlistCards }).length === 0,
  );
  return legal?.id ?? "";
}

function getStepState({ index, current }: { index: number; current: number }): "done" | "now" | "todo" {
  if (index < current) {
    return "done";
  }
  return index === current ? "now" : "todo";
}
