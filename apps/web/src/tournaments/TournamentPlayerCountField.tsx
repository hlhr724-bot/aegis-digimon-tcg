import "@/tournaments/tournamentCatalog.css";
import { useId } from "react";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";

type TournamentPlayerCountFieldParams = {
  value: number;
  error?: string;
  onChange: (value: number) => void;
};

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 1024;
const COMMON_SIZES = [8, 16, 32, 64, 128] as const;

export function TournamentPlayerCountField({ value, error, onChange }: TournamentPlayerCountFieldParams) {
  const { t } = useTranslation();
  const id = useId();
  const clamp = (next: number) => Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, next));
  return (
    <div className="aegis-field create-tournament__wide">
      <label className="aegis-field__label" htmlFor={id}>
        {t("tournaments.create.maxPlayers")}
      </label>
      <div className="create-tournament__inline">
        <div className="create-tournament__stepper">
          <button
            type="button"
            aria-label={t("tournaments.create.fewerPlayers")}
            disabled={value <= MIN_PLAYERS}
            onClick={() => onChange(clamp(value - 1))}
          >
            <Icons.ChevronDown size={16} aria-hidden="true" />
          </button>
          <input
            id={id}
            type="number"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <button
            type="button"
            aria-label={t("tournaments.create.morePlayers")}
            disabled={value >= MAX_PLAYERS}
            onClick={() => onChange(clamp(value + 1))}
          >
            <Icons.ChevronUp size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="tournaments-chips" role="group" aria-label={t("tournaments.create.commonSizes")}>
          {COMMON_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className="tournaments-chip"
              aria-pressed={value === size}
              onClick={() => onChange(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <span id={`${id}-error`} className="aegis-field__message" data-error>
          {error}
        </span>
      ) : null}
    </div>
  );
}
