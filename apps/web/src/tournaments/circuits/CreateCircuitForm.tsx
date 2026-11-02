import { useId, useState, type FormEvent } from "react";
import type { TournamentStructure } from "@aegis/shared";
import { isTournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/isTournamentCircuitCadence";
import { TournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/TournamentCircuitCadence";
import type {
  TournamentCircuitPointsTier,
  TournamentCircuitSchedule,
  TournamentCircuitView,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { DEFAULT_CIRCUIT_SETTINGS } from "@aegis/shared/tournaments/circuits/DEFAULT_CIRCUIT_SETTINGS";
import { Alert, Button, Field, Switch } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { Translate } from "@/i18n/translationTypes";
import { tournamentApi, type ApiError } from "@/tournaments/client";
import { reasonKey, structureKey } from "@/tournaments/labels";
import type { TournamentValidationError } from "@/tournaments/types";
import { formatCircuitWeekday } from "@/tournaments/circuits/formatCircuitWeekday";
import "@/tournaments/circuits/circuits.css";

type SlotRow = { day: number; localTime: string };

type Props = {
  onCreated: (circuit: TournamentCircuitView) => void;
  onCancel: () => void;
};

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const CADENCES = Object.values(TournamentCircuitCadence);
const FIRST_SLOTS: Record<TournamentCircuitCadence, SlotRow> = {
  [TournamentCircuitCadence.WEEKLY.value]: { day: 6, localTime: "18:00" },
  [TournamentCircuitCadence.MONTHLY.value]: { day: 1, localTime: "18:00" },
};
const ADDED_SLOTS: Record<TournamentCircuitCadence, SlotRow> = {
  [TournamentCircuitCadence.WEEKLY.value]: { day: 3, localTime: "20:00" },
  [TournamentCircuitCadence.MONTHLY.value]: { day: 15, localTime: "18:00" },
};
const CIRCUIT_REASON_KEYS = {
  name_length_invalid: "tournaments.circuits.reason.name",
  description_too_long: "tournaments.circuits.reason.description",
  period_invalid: "tournaments.circuits.reason.period",
  period_in_past: "tournaments.circuits.reason.periodInPast",
  time_zone_invalid: "tournaments.circuits.reason.timeZone",
  slots_invalid: "tournaments.circuits.reason.slots",
  lead_time_invalid: "tournaments.circuits.reason.leadTime",
  check_in_window_invalid: "tournaments.circuits.reason.checkIn",
  points_table_invalid: "tournaments.circuits.reason.pointsTable",
  participation_points_invalid: "tournaments.circuits.reason.participation",
  no_occurrences: "tournaments.circuits.reason.noOccurrences",
} as const;

export function CreateCircuitForm({ onCreated, onCancel }: Props) {
  const { t, locale } = useTranslation();
  const formId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => toDateInput(Date.now()));
  const [endDate, setEndDate] = useState(() => toDateInput(Date.now() + 28 * DAY_MS));
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [cadence, setCadence] = useState<TournamentCircuitCadence>(TournamentCircuitCadence.WEEKLY.value);
  const [slots, setSlots] = useState<SlotRow[]>([FIRST_SLOTS[TournamentCircuitCadence.WEEKLY.value]]);
  const [leadTimeHours, setLeadTimeHours] = useState(DEFAULT_CIRCUIT_SETTINGS.leadTimeMs / HOUR_MS);
  const [checkInMinutes, setCheckInMinutes] = useState(DEFAULT_CIRCUIT_SETTINGS.checkInWindowMs / MINUTE_MS);
  const [structure, setStructure] = useState<TournamentStructure>("swiss");
  const [bestOf, setBestOf] = useState<1 | 3>(1);
  const [topCut, setTopCut] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(32);
  const [allowBots, setAllowBots] = useState(false);
  const [pointsTable, setPointsTable] = useState<TournamentCircuitPointsTier[]>(() =>
    DEFAULT_CIRCUIT_SETTINGS.pointsTable.map((tier) => ({ ...tier })),
  );
  const [participationPoints, setParticipationPoints] = useState<number>(DEFAULT_CIRCUIT_SETTINGS.participationPoints);
  const [errors, setErrors] = useState<TournamentValidationError[]>([]);
  const [failure, setFailure] = useState<ApiError>();
  const [submitting, setSubmitting] = useState(false);
  const timeZones = supportedTimeZones(timeZone);
  const cadenceEntry = CADENCES.find((entry) => entry.value === cadence) ?? TournamentCircuitCadence.WEEKLY;
  const dayOptions = Array.from(
    { length: cadenceEntry.lastDay - cadenceEntry.firstDay + 1 },
    (_, index) => cadenceEntry.firstDay + index,
  );

  function selectCadence(next: TournamentCircuitCadence) {
    setCadence(next);
    setSlots([FIRST_SLOTS[next]]);
  }

  function updateSlot(index: number, slot: Partial<SlotRow>) {
    setSlots((current) => current.map((entry, position) => (position === index ? { ...entry, ...slot } : entry)));
  }

  function updateTier(index: number, tier: Partial<TournamentCircuitPointsTier>) {
    setPointsTable((current) => current.map((entry, position) => (position === index ? { ...entry, ...tier } : entry)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setFailure(undefined);
    const result = await tournamentApi.createCircuit({
      name: name.trim(),
      description: description.trim(),
      startsAt: new Date(`${startDate}T00:00`).getTime(),
      endsAt: new Date(`${endDate}T00:00`).getTime() + DAY_MS,
      timeZone,
      schedule: toSchedule(cadence, slots),
      leadTimeMs: leadTimeHours * HOUR_MS,
      checkInWindowMs: checkInMinutes * MINUTE_MS,
      pointsTable,
      participationPoints,
      template: {
        structure,
        bestOf,
        topCut: structure === "swiss" && topCut,
        maxPlayers,
        allowBots,
        banlist: { mode: "none" },
      },
    });
    setSubmitting(false);
    if (result.ok) {
      onCreated(result.value);
      return;
    }
    setErrors(result.error.reasons ?? []);
    if (!result.error.reasons?.length) {
      setFailure(result.error);
    }
  }

  return (
    <form className="create-circuit" onSubmit={(event) => void submit(event)} noValidate>
      <header className="create-circuit__head">
        <h2>{t("tournaments.circuits.createTitle")}</h2>
        <p>{t("tournaments.circuits.createHelp")}</p>
      </header>

      {errors.length > 0 ? (
        <Alert tone="danger" title={t("tournaments.circuits.error.invalid")}>
          <ul>
            {errors.map((error) => (
              <li key={`${error.field}:${error.code}`}>{reasonMessage(error, t)}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {failure ? (
        <Alert tone="danger" title={t("tournaments.circuits.error.create")}>
          {t(reasonKey(failure.code) ?? "tournaments.reason.unknown", {
            code: failure.code,
          })}
        </Alert>
      ) : null}

      <fieldset className="create-circuit__section">
        <legend>{t("tournaments.create.section.basics")}</legend>
        <Field label={t("tournaments.create.name")} value={name} onChange={(event) => setName(event.target.value)} />
        <div className="aegis-field">
          <label className="aegis-field__label" htmlFor={`${formId}-description`}>
            {t("tournaments.create.description")}
          </label>
          <textarea
            id={`${formId}-description`}
            className="aegis-field__control"
            value={description}
            maxLength={1000}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="create-circuit__section">
        <legend>{t("tournaments.circuits.section.period")}</legend>
        <div className="create-circuit__row">
          <Field
            label={t("tournaments.circuits.startDate")}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <Field
            label={t("tournaments.circuits.endDate")}
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
        <div className="aegis-field">
          <label className="aegis-field__label" htmlFor={`${formId}-zone`}>
            {t("tournaments.circuits.timeZone")}
          </label>
          <select
            id={`${formId}-zone`}
            className="aegis-field__control"
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
        <div className="aegis-field">
          <label className="aegis-field__label" htmlFor={`${formId}-cadence`}>
            {t("tournaments.circuits.cadence")}
          </label>
          <select
            id={`${formId}-cadence`}
            className="aegis-field__control"
            value={cadence}
            onChange={(event) => {
              if (isTournamentCircuitCadence(event.target.value)) {
                selectCadence(event.target.value);
              }
            }}
          >
            {CADENCES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {t(entry.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="create-circuit__list" role="group" aria-label={t("tournaments.circuits.slotsLabel")}>
          <span className="aegis-field__label">{t("tournaments.circuits.slotsLabel")}</span>
          {slots.map((slot, index) => (
            <div className="create-circuit__row" key={index}>
              <div className="aegis-field">
                <label className="aegis-field__label" htmlFor={`${formId}-day-${index}`}>
                  {t(
                    cadence === TournamentCircuitCadence.WEEKLY.value
                      ? "tournaments.circuits.weekday"
                      : "tournaments.circuits.monthDay",
                  )}
                </label>
                <select
                  id={`${formId}-day-${index}`}
                  className="aegis-field__control"
                  value={slot.day}
                  onChange={(event) => updateSlot(index, { day: Number(event.target.value) })}
                >
                  {dayOptions.map((day) => (
                    <option key={day} value={day}>
                      {cadence === TournamentCircuitCadence.WEEKLY.value ? formatCircuitWeekday(day, locale) : day}
                    </option>
                  ))}
                </select>
              </div>
              <Field
                label={t("tournaments.circuits.time")}
                type="time"
                value={slot.localTime}
                onChange={(event) => updateSlot(index, { localTime: event.target.value })}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={Icons.Trash}
                disabled={slots.length === 1}
                onClick={() => setSlots((current) => current.filter((_, position) => position !== index))}
              >
                {t("tournaments.circuits.remove")}
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            icon={Icons.Plus}
            onClick={() => setSlots((current) => [...current, ADDED_SLOTS[cadence]])}
          >
            {t("tournaments.circuits.addSlot")}
          </Button>
          {cadence === TournamentCircuitCadence.MONTHLY.value ? (
            <p className="create-circuit__hint">{t("tournaments.circuits.monthDayHint")}</p>
          ) : null}
        </div>
        <div className="create-circuit__row">
          <Field
            label={t("tournaments.circuits.leadTime")}
            type="number"
            min={1}
            max={336}
            value={leadTimeHours}
            onChange={(event) => setLeadTimeHours(Number(event.target.value))}
          />
          <Field
            label={t("tournaments.circuits.checkInWindow")}
            type="number"
            min={5}
            max={120}
            value={checkInMinutes}
            onChange={(event) => setCheckInMinutes(Number(event.target.value))}
          />
        </div>
      </fieldset>

      <fieldset className="create-circuit__section">
        <legend>{t("tournaments.create.section.format")}</legend>
        <div className="create-circuit__row">
          <div className="aegis-field">
            <label className="aegis-field__label" htmlFor={`${formId}-structure`}>
              {t("tournaments.create.structure")}
            </label>
            <select
              id={`${formId}-structure`}
              className="aegis-field__control"
              value={structure}
              onChange={(event) => setStructure(event.target.value as TournamentStructure)}
            >
              {(["swiss", "single_elimination"] as const).map((option) => (
                <option key={option} value={option}>
                  {t(structureKey(option))}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="create-circuit__row">
          <div className="aegis-field">
            <label className="aegis-field__label" htmlFor={`${formId}-best-of`}>
              {t("tournaments.create.bestOf")}
            </label>
            <select
              id={`${formId}-best-of`}
              className="aegis-field__control"
              value={bestOf}
              onChange={(event) => setBestOf(Number(event.target.value) === 3 ? 3 : 1)}
            >
              {([1, 3] as const).map((option) => (
                <option key={option} value={option}>
                  {t("tournaments.bestOf", { count: option })}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={t("tournaments.create.maxPlayers")}
            type="number"
            min={2}
            max={1024}
            value={maxPlayers}
            onChange={(event) => setMaxPlayers(Number(event.target.value))}
          />
        </div>
        {structure === "swiss" ? (
          <Switch label={t("tournaments.badge.topCut")} checked={topCut} onChange={setTopCut} />
        ) : null}
        <Switch label={t("tournaments.badge.bots")} checked={allowBots} onChange={setAllowBots} />
      </fieldset>

      <fieldset className="create-circuit__section">
        <legend>{t("tournaments.circuits.scoring")}</legend>
        <p className="create-circuit__hint">{t("tournaments.circuits.scoringHelp")}</p>
        {pointsTable.map((tier, index) => (
          <div className="create-circuit__row" key={index}>
            <Field
              label={t("tournaments.circuits.upToPlacement")}
              type="number"
              min={1}
              value={tier.maxPlacement}
              onChange={(event) => updateTier(index, { maxPlacement: Number(event.target.value) })}
            />
            <Field
              label={t("tournaments.circuits.column.points")}
              type="number"
              min={0}
              value={tier.points}
              onChange={(event) => updateTier(index, { points: Number(event.target.value) })}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={Icons.Trash}
              disabled={pointsTable.length === 1}
              onClick={() => setPointsTable((current) => current.filter((_, position) => position !== index))}
            >
              {t("tournaments.circuits.remove")}
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          icon={Icons.Plus}
          onClick={() =>
            setPointsTable((current) => [
              ...current,
              {
                maxPlacement: (current.at(-1)?.maxPlacement ?? 0) * 2 || 1,
                points: 0,
              },
            ])
          }
        >
          {t("tournaments.circuits.addTier")}
        </Button>
        <Field
          label={t("tournaments.circuits.participation")}
          type="number"
          min={0}
          max={100}
          value={participationPoints}
          onChange={(event) => setParticipationPoints(Number(event.target.value))}
        />
      </fieldset>

      <div className="create-circuit__actions">
        <Button variant="ghost" onClick={onCancel}>
          {t("tournaments.circuits.cancelNo")}
        </Button>
        <Button type="submit" icon={Icons.Calendar} disabled={submitting}>
          {t("tournaments.circuits.submit")}
        </Button>
      </div>
    </form>
  );
}

function toSchedule(cadence: TournamentCircuitCadence, slots: SlotRow[]): TournamentCircuitSchedule {
  return cadence === TournamentCircuitCadence.WEEKLY.value
    ? {
        cadence,
        slots: slots.map((slot) => ({
          weekday: slot.day,
          localTime: slot.localTime,
        })),
      }
    : {
        cadence,
        slots: slots.map((slot) => ({
          monthDay: slot.day,
          localTime: slot.localTime,
        })),
      };
}

function toDateInput(epochMs: number): string {
  const local = new Date(epochMs - new Date(epochMs).getTimezoneOffset() * MINUTE_MS);
  return local.toISOString().slice(0, 10);
}

function supportedTimeZones(selected: string): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes(selected) ? zones : [selected, ...zones];
}

function reasonMessage(error: TournamentValidationError, t: Translate): string {
  const circuitKey = CIRCUIT_REASON_KEYS[error.code as keyof typeof CIRCUIT_REASON_KEYS];
  if (circuitKey) {
    return t(circuitKey);
  }
  const tournamentKey = reasonKey(error.code);
  return tournamentKey ? t(tournamentKey, { code: error.code }) : t("tournaments.reason.unknown", { code: error.code });
}
