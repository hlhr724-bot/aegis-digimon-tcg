import type { TournamentClockSettings } from "@aegis/shared/tournaments/TournamentClockSettings";
import { Field, Switch } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";

type Props = {
  value: TournamentClockSettings | undefined;
  onChange: (value: TournamentClockSettings | undefined) => void;
};

const DEFAULT_CLOCKS: TournamentClockSettings = {
  roundMinutes: 45,
  eliminationMinutes: 55,
  finalMinutes: null,
  overtimeMinutes: 5,
};

export function TournamentClockFields({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <section className="tournaments-clocks">
      <Switch
        checked={value !== undefined}
        onChange={(enabled) => onChange(enabled ? { ...DEFAULT_CLOCKS } : undefined)}
        label={t("tournaments.clocks.custom")}
        description={t("tournaments.clocks.description")}
      />
      {value ? (
        <>
          <Field
            label={t("tournaments.clocks.round")}
            type="number"
            min={1}
            max={240}
            value={value.roundMinutes}
            onChange={(event) => onChange({ ...value, roundMinutes: Number(event.target.value) })}
          />
          <Field
            label={t("tournaments.clocks.elimination")}
            type="number"
            min={1}
            max={240}
            value={value.eliminationMinutes}
            onChange={(event) => onChange({ ...value, eliminationMinutes: Number(event.target.value) })}
          />
          <Switch
            checked={value.finalMinutes === null}
            onChange={(untimed) => onChange({ ...value, finalMinutes: untimed ? null : value.eliminationMinutes })}
            label={t("tournaments.clocks.untimedFinal")}
          />
          {value.finalMinutes !== null ? (
            <Field
              label={t("tournaments.clocks.final")}
              type="number"
              min={1}
              max={240}
              value={value.finalMinutes}
              onChange={(event) => onChange({ ...value, finalMinutes: Number(event.target.value) })}
            />
          ) : null}
          <Field
            label={t("tournaments.clocks.overtime")}
            type="number"
            min={0}
            max={60}
            value={value.overtimeMinutes}
            onChange={(event) => onChange({ ...value, overtimeMinutes: Number(event.target.value) })}
          />
        </>
      ) : null}
    </section>
  );
}
