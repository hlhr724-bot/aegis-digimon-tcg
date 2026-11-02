import { useCallback, useId, useState } from "react";
import type {
  TournamentCircuitLeaderboard,
  TournamentCircuitView,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { TournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/TournamentCircuitCadence";
import { TournamentCircuitStatus } from "@aegis/shared/tournaments/circuits/TournamentCircuitStatus";
import { Alert, Badge, Button, Eyebrow } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { tournamentApi, type ApiError } from "@/tournaments/client";
import { usePolledRequest } from "@/tournaments/hooks";
import { reasonKey, statusKey } from "@/tournaments/labels";
import { CircuitLeaderboardTable } from "@/tournaments/circuits/CircuitLeaderboardTable";
import { formatCircuitSchedule } from "@/tournaments/circuits/formatCircuitSchedule";
import "@/tournaments/circuits/circuits.css";

type Props = {
  id: string;
  accountIsAdmin: boolean;
  onBack: () => void;
  onOpenTournament: (id: string) => void;
};

const POLL_MS = 30_000;

export function CircuitDetail({ id, accountIsAdmin, onBack, onOpenTournament }: Props) {
  const { t, locale } = useTranslation();
  const scheduleId = useId();
  const scoringId = useId();
  const eventsId = useId();
  const [circuit, setCircuit] = useState<TournamentCircuitView>();
  const [leaderboard, setLeaderboard] = useState<TournamentCircuitLeaderboard>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState<ApiError>();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const loadCircuit = useCallback((signal: AbortSignal) => tournamentApi.circuit(id, signal), [id]);
  const applyCircuit = useCallback((result: Awaited<ReturnType<typeof tournamentApi.circuit>>) => {
    if (result.ok) {
      setCircuit(result.value);
      setError(undefined);
    } else {
      setError(result.error);
    }
  }, []);
  usePolledRequest(loadCircuit, applyCircuit, POLL_MS);

  const loadLeaderboard = useCallback(
    (signal: AbortSignal) => tournamentApi.circuitLeaderboard(id, page, signal),
    [id, page],
  );
  const applyLeaderboard = useCallback((result: Awaited<ReturnType<typeof tournamentApi.circuitLeaderboard>>) => {
    if (result.ok) {
      setLeaderboard(result.value);
    }
  }, []);
  usePolledRequest(loadLeaderboard, applyLeaderboard, POLL_MS);

  async function cancel() {
    setCancelling(true);
    const result = await tournamentApi.cancelCircuit(id);
    setCancelling(false);
    setConfirmingCancel(false);
    if (result.ok) {
      setCircuit(result.value);
    } else {
      setError(result.error);
    }
  }

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const dateTimeFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
  });
  const tileFormats = {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    day: new Intl.DateTimeFormat(locale, { day: "numeric" }),
    month: new Intl.DateTimeFormat(locale, { month: "short" }),
  };
  const occurrenceDateFormat = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" });
  const timeFormat = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  const active = circuit?.status === TournamentCircuitStatus.ACTIVE.value;

  return (
    <section className="circuit-detail" aria-label={circuit?.name ?? t("tournaments.circuits.title")}>
      <Button variant="ghost" icon={Icons.ArrowLeft} onClick={onBack}>
        {t("tournaments.back")}
      </Button>
      {error ? (
        <Alert tone="danger" title={t("tournaments.circuits.error.load")}>
          {t(reasonKey(error.code) ?? "tournaments.reason.unknown", {
            code: error.code,
          })}
        </Alert>
      ) : null}
      {!circuit && !error ? <p role="status">{t("common.loading")}</p> : null}
      {circuit ? (
        <>
          <header className="circuit-detail__header">
            <div className="circuit-detail__intro">
              <Eyebrow>{t("tournaments.circuits.eyebrow")}</Eyebrow>
              <div className="circuit-detail__title">
                <h1>{circuit.name}</h1>
                <Badge tone={active ? "success" : "neutral"}>{t(statusLabelKey(circuit.status))}</Badge>
              </div>
              {circuit.description ? <p>{circuit.description}</p> : null}
              <ul className="circuit-detail__meta">
                <li>
                  <Icons.Calendar size={14} />
                  {t("tournaments.circuits.period", {
                    start: dateFormat.format(circuit.startsAt),
                    end: dateFormat.format(circuit.endsAt),
                  })}
                </li>
                <li>
                  <Icons.RotateCcw size={14} />
                  {t(cadenceLabelKey(circuit.schedule.cadence))}
                </li>
                <li>
                  <Icons.Compass size={14} />
                  {circuit.timeZone}
                </li>
              </ul>
            </div>
            {accountIsAdmin && active ? (
              <div className="circuit-detail__actions">
                {confirmingCancel ? (
                  <>
                    <span>{t("tournaments.circuits.cancelConfirm")}</span>
                    <Button variant="danger" disabled={cancelling} onClick={() => void cancel()}>
                      {t("tournaments.circuits.cancelYes")}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmingCancel(false)}>
                      {t("tournaments.circuits.cancelNo")}
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" icon={Icons.Trash} onClick={() => setConfirmingCancel(true)}>
                    {t("tournaments.circuits.cancel")}
                  </Button>
                )}
              </div>
            ) : null}
          </header>

          <div className="circuit-detail__grid">
            <section className="circuit-detail__panel" aria-labelledby={scheduleId}>
              <div className="circuit-detail__schedule-head">
                <h2 id={scheduleId}>{t("tournaments.circuits.schedule")}</h2>
                <ul className="circuit-detail__slots">
                  {formatCircuitSchedule(circuit.schedule, locale, t).map((slot) => (
                    <li key={slot}>{slot}</li>
                  ))}
                </ul>
              </div>
              {circuit.upcoming.length > 0 ? (
                <>
                  <h3>{t("tournaments.circuits.upcoming")}</h3>
                  <ul className="circuit-detail__upcoming">
                    {circuit.upcoming.map((occurrence) => (
                      <li key={occurrence}>
                        <span className="circuit-detail__tile" aria-hidden="true">
                          <span>{tileFormats.weekday.format(occurrence)}</span>
                          <strong>{tileFormats.day.format(occurrence)}</strong>
                          <span>{tileFormats.month.format(occurrence)}</span>
                        </span>
                        <time dateTime={new Date(occurrence).toISOString()}>
                          <span className="aegis-sr-only">{dateTimeFormat.format(occurrence)}</span>
                          <span aria-hidden="true">{occurrenceDateFormat.format(occurrence)}</span>
                        </time>
                        <span className="circuit-detail__time" aria-hidden="true">
                          <Icons.Clock size={14} />
                          {timeFormat.format(occurrence)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="circuit-detail__empty">{t("tournaments.circuits.noNext")}</p>
              )}
            </section>

            <div className="circuit-detail__side">
              <section className="circuit-detail__panel" aria-labelledby={scoringId}>
                <h2 id={scoringId}>
                  <Icons.Trophy size={18} />
                  {t("tournaments.circuits.scoring")}
                </h2>
                <ul className="circuit-detail__scoring">
                  {circuit.pointsTable.map((tier, index) => (
                    <li key={tier.maxPlacement}>
                      <span>
                        {placementRange(circuit.pointsTable[index - 1]?.maxPlacement ?? 0, tier.maxPlacement)}
                      </span>
                      <strong>
                        {t("tournaments.circuits.points", {
                          points: tier.points,
                        })}
                      </strong>
                    </li>
                  ))}
                  {circuit.participationPoints > 0 ? (
                    <li>
                      <span>{t("tournaments.circuits.participation")}</span>
                      <strong>
                        {t("tournaments.circuits.points", {
                          points: circuit.participationPoints,
                        })}
                      </strong>
                    </li>
                  ) : null}
                </ul>
              </section>

              <section className="circuit-detail__panel" aria-labelledby={eventsId}>
                <h2 id={eventsId}>
                  <Icons.Calendar size={18} />
                  {t("tournaments.circuits.events")}
                </h2>
                {circuit.tournaments.length === 0 ? (
                  <p className="circuit-detail__empty">
                    {t("tournaments.circuits.noEvents", {
                      hours: Math.round(circuit.leadTimeMs / 3_600_000),
                    })}
                  </p>
                ) : (
                  <ul className="circuit-detail__events">
                    {circuit.tournaments.map((event) => (
                      <li key={event.tournamentId}>
                        <button type="button" onClick={() => onOpenTournament(event.tournamentId)}>
                          <span>{event.name}</span>
                          <time dateTime={new Date(event.startsAt).toISOString()}>
                            {dateTimeFormat.format(event.startsAt)}
                          </time>
                          <Badge>{t(statusKey(event.status))}</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <CircuitLeaderboardTable leaderboard={leaderboard} onPage={setPage} />
        </>
      ) : null}
    </section>
  );
}

function statusLabelKey(status: TournamentCircuitView["status"]) {
  return (
    Object.values(TournamentCircuitStatus).find((entry) => entry.value === status) ?? TournamentCircuitStatus.ACTIVE
  ).labelKey;
}

function cadenceLabelKey(cadence: TournamentCircuitView["schedule"]["cadence"]) {
  return (
    Object.values(TournamentCircuitCadence).find((entry) => entry.value === cadence) ?? TournamentCircuitCadence.WEEKLY
  ).labelKey;
}

function placementRange(previous: number, current: number): string {
  return previous + 1 === current ? `#${current}` : `#${previous + 1}–${current}`;
}
