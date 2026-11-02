import {
  DEFAULT_TOURNAMENT_POINTS,
  MAX_TOURNAMENT_POINTS,
  type TournamentPoints,
} from "@aegis/shared/tournaments/TournamentPoints";
import { useId } from "react";
import { HelpTip } from "@/design/HelpTip";
import { Field } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";

type Props = {
  value: TournamentPoints | null;
  onChange: (value: TournamentPoints | null) => void;
  error?: string;
};

const OUTCOMES = [
  { key: "win", labelKey: "tournaments.format.pointsWin" },
  { key: "draw", labelKey: "tournaments.format.pointsDraw" },
  { key: "loss", labelKey: "tournaments.format.pointsLoss" },
] as const;

export function TournamentPointsField({ value, onChange, error }: Props) {
  const { t } = useTranslation();
  const labelId = useId();
  const points = value ?? DEFAULT_TOURNAMENT_POINTS;
  const custom = value !== null;

  return (
    <div className="create-tournament__wide create-tournament__group tournaments-points">
      <span className="create-tournament__label tournaments-tiebreakers__label">
        <span id={labelId}>{t("tournaments.format.points")}</span>
        <HelpTip label={t("tournaments.formatHelp.label", { setting: t("tournaments.format.points") })}>
          <p>{t("tournaments.formatHelp.points")}</p>
        </HelpTip>
      </span>
      <div className="create-tournament__segmented" role="group" aria-labelledby={labelId}>
        <button type="button" aria-pressed={!custom} onClick={() => onChange(null)}>
          {t("tournaments.create.pointsAuto")}
        </button>
        <button type="button" aria-pressed={custom} onClick={() => onChange({ ...points })}>
          {t("tournaments.create.custom")}
        </button>
      </div>
      {custom ? (
        <div className="tournaments-points__fields">
          {OUTCOMES.map((outcome) => (
            <Field
              key={outcome.key}
              label={t(outcome.labelKey)}
              type="number"
              min={0}
              max={MAX_TOURNAMENT_POINTS}
              value={points[outcome.key]}
              onChange={(event) => onChange({ ...points, [outcome.key]: Number(event.target.value) })}
            />
          ))}
        </div>
      ) : null}
      {error ? <span className="aegis-field__message">{error}</span> : null}
    </div>
  );
}
