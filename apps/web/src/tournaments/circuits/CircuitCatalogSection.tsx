import { useCallback, useId, useState } from "react";
import type { TournamentCircuitSummary } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { TournamentCircuitStatus } from "@aegis/shared/tournaments/circuits/TournamentCircuitStatus";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { tournamentApi } from "@/tournaments/client";
import { usePolledRequest } from "@/tournaments/hooks";
import { formatCircuitSchedule } from "@/tournaments/circuits/formatCircuitSchedule";
import "@/tournaments/circuits/circuits.css";

type Props = {
  canCreate: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
};

const POLL_MS = 60_000;

export function CircuitCatalogSection({ canCreate, onOpen, onCreate }: Props) {
  const { t, locale } = useTranslation();
  const headingId = useId();
  const [circuits, setCircuits] = useState<TournamentCircuitSummary[]>([]);
  const load = useCallback((signal: AbortSignal) => tournamentApi.circuits(signal), []);
  const apply = useCallback((result: Awaited<ReturnType<typeof tournamentApi.circuits>>) => {
    if (result.ok) {
      setCircuits(result.value.items.filter((circuit) => circuit.status === TournamentCircuitStatus.ACTIVE.value));
    }
  }, []);
  usePolledRequest(load, apply, POLL_MS);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const nextFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <section className="circuits-catalog" aria-labelledby={headingId}>
      <header className="circuits-catalog__header">
        <div>
          <h2 id={headingId}>{t("tournaments.circuits.title")}</h2>
          <p>{t("tournaments.circuits.subtitle")}</p>
        </div>
        {canCreate ? (
          <Button size="sm" variant="secondary" icon={Icons.Plus} onClick={onCreate}>
            {t("tournaments.circuits.create")}
          </Button>
        ) : null}
      </header>
      {circuits.length === 0 ? <p className="circuits-catalog__empty">{t("tournaments.circuits.empty")}</p> : null}
      <ul className="circuits-catalog__list">
        {circuits.map((circuit) => (
          <li key={circuit.id}>
            <button type="button" className="circuits-card" onClick={() => onOpen(circuit.id)}>
              <span className="circuits-card__icon" aria-hidden="true">
                <Icons.Trophy size={18} />
              </span>
              <span className="circuits-card__name">{circuit.name}</span>
              {circuit.description ? <span className="circuits-card__description">{circuit.description}</span> : null}
              <span className="circuits-card__period">
                {t("tournaments.circuits.period", {
                  start: dateFormat.format(circuit.startsAt),
                  end: dateFormat.format(circuit.endsAt),
                })}
              </span>
              <span className="circuits-card__slots">
                {formatCircuitSchedule(circuit.schedule, locale, t).map((slot) => (
                  <span key={slot}>{slot}</span>
                ))}
              </span>
              <span className="circuits-card__next">
                <Icons.Calendar size={14} aria-hidden="true" />
                {circuit.nextOccurrenceAt === null
                  ? t("tournaments.circuits.noNext")
                  : t("tournaments.circuits.next", {
                      date: nextFormat.format(circuit.nextOccurrenceAt),
                    })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
