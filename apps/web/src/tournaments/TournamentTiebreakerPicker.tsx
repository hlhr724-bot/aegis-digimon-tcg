import type { TournamentStructure } from "@aegis/shared";
import { defaultTiebreakers } from "@aegis/shared/tournaments/defaultTiebreakers";
import { tiebreakersForStructure } from "@aegis/shared/tournaments/tiebreakersForStructure";
import type { TournamentTiebreaker } from "@aegis/shared/tournaments/TournamentTiebreaker";
import { useId } from "react";
import { HelpTip } from "@/design/HelpTip";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { tiebreakerHelpKey } from "@/tournaments/tiebreakerHelpKey";
import { tiebreakerLabelKey } from "@/tournaments/tiebreakerLabelKey";

type Props = {
  structure: TournamentStructure;
  value: TournamentTiebreaker[] | null;
  onChange: (value: TournamentTiebreaker[] | null) => void;
  error?: string;
};

function moved(list: readonly TournamentTiebreaker[], from: number, to: number): TournamentTiebreaker[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function TournamentTiebreakerPicker({ structure, value, onChange, error }: Props) {
  const { t } = useTranslation();
  const labelId = useId();
  const addId = useId();
  const order = value ?? defaultTiebreakers(structure);
  const remaining = tiebreakersForStructure(structure).filter((tiebreaker) => !order.includes(tiebreaker));
  const custom = value !== null;

  return (
    <div className="create-tournament__wide create-tournament__group tournaments-tiebreakers">
      <span className="create-tournament__label tournaments-tiebreakers__label">
        <span id={labelId}>{t("tournaments.format.tiebreakers")}</span>
        <HelpTip label={t("tournaments.formatHelp.label", { setting: t("tournaments.format.tiebreakers") })}>
          <p>{t("tournaments.formatHelp.tiebreakers")}</p>
        </HelpTip>
      </span>
      <div className="create-tournament__segmented" role="group" aria-labelledby={labelId}>
        <button type="button" aria-pressed={!custom} onClick={() => onChange(null)}>
          {t("tournaments.create.auto")}
        </button>
        <button type="button" aria-pressed={custom} onClick={() => onChange([...order])}>
          {t("tournaments.create.custom")}
        </button>
      </div>
      <ol className="tournaments-tiebreakers__list" aria-labelledby={labelId}>
        {order.map((tiebreaker, index) => {
          const label = t(tiebreakerLabelKey(tiebreaker));
          return (
            <li key={tiebreaker}>
              <span className="tournaments-tiebreakers__name">
                {label}
                <HelpTip label={t("tournaments.formatHelp.label", { setting: label })}>
                  <p>{t(tiebreakerHelpKey(tiebreaker))}</p>
                </HelpTip>
              </span>
              {custom ? (
                <span className="tournaments-tiebreakers__actions">
                  <button
                    type="button"
                    aria-label={t("tournaments.create.tiebreakerUp", { tiebreaker: label })}
                    disabled={index === 0}
                    onClick={() => onChange(moved(order, index, index - 1))}
                  >
                    <Icons.ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("tournaments.create.tiebreakerDown", { tiebreaker: label })}
                    disabled={index === order.length - 1}
                    onClick={() => onChange(moved(order, index, index + 1))}
                  >
                    <Icons.ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("tournaments.create.tiebreakerRemove", { tiebreaker: label })}
                    disabled={order.length === 1}
                    onClick={() => onChange(order.filter((entry) => entry !== tiebreaker))}
                  >
                    <Icons.Trash size={16} />
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {custom && remaining.length > 0 ? (
        <div className="aegis-field">
          <label className="aegis-field__label" htmlFor={addId}>
            {t("tournaments.create.tiebreakerAdd")}
          </label>
          <select
            id={addId}
            className="aegis-field__control"
            value=""
            onChange={(event) => onChange([...order, event.target.value as TournamentTiebreaker])}
          >
            <option value="" disabled>
              {t("tournaments.create.tiebreakerChoose")}
            </option>
            {remaining.map((tiebreaker) => (
              <option key={tiebreaker} value={tiebreaker}>
                {t(tiebreakerLabelKey(tiebreaker))}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <p className="create-tournament__hint">{t("tournaments.formatHelp.tiebreakersFinal")}</p>
      {error ? <span className="aegis-field__message">{error}</span> : null}
    </div>
  );
}
