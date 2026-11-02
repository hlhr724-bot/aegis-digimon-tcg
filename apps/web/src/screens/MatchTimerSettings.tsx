import {
  MATCH_TIMER_START_OPTIONS,
  MATCH_TIMER_START_SECONDS,
  MATCH_TIMER_REFILL_SECONDS,
  MATCH_TIMER_OPPONENT_REFILL_SECONDS,
  type MatchTimerOptions,
} from "@aegis/shared";
import { useId } from "react";
import { Icons } from "../design/icons";
import { useTranslation } from "../i18n";
import "./matchTimerSettings.css";

export function MatchTimerSettings({
  options,
  onChange,
  privateRoom,
}: {
  options: Required<MatchTimerOptions>;
  onChange: (options: Required<MatchTimerOptions>) => void;
  privateRoom: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const startSeconds = privateRoom ? options.timerStartSeconds : MATCH_TIMER_START_SECONDS;
  const reserve = [
    ["lobby.timer.start", startSeconds, false],
    ["lobby.timer.yourTurn", MATCH_TIMER_REFILL_SECONDS, true],
    ["lobby.timer.opponentTurn", MATCH_TIMER_OPPONENT_REFILL_SECONDS, true],
  ] as const;
  return (
    <div className="lobby-timer-settings">
      <div className="lobby-timer-settings__header">
        <span id={`${id}-label`} className="lobby-timer-settings__label">
          <span aria-hidden="true">
            <Icons.Clock size={20} />
          </span>
          {t("lobby.timer.label")}
        </span>
        <div className="lobby-timer-settings__control">
          <span className="lobby-timer-settings__status">
            {t(options.matchTimer ? "lobby.timer.on" : "lobby.timer.off")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={options.matchTimer}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-hint`}
            className="lobby-timer-switch"
            onClick={() => onChange({ ...options, matchTimer: !options.matchTimer })}
          >
            <span />
          </button>
        </div>
      </div>
      {options.matchTimer ? (
        <dl className="lobby-timer-reserve">
          {reserve.map(([label, seconds, bonus]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd>
                {bonus ? "+" : ""}
                {t("lobby.timer.shortSeconds", { seconds })}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p id={`${id}-hint`} className="lobby-timer-settings__hint">
        {options.matchTimer
          ? t("lobby.timer.capHint", { seconds: startSeconds })
          : t(privateRoom ? "lobby.timer.offHint" : "lobby.timer.publicHint")}
      </p>
      {options.matchTimer && privateRoom ? (
        <div className="lobby-timer-duration">
          <label>
            {t("lobby.timer.start")}
            <select
              value={options.timerStartSeconds}
              onChange={(event) => onChange({ ...options, timerStartSeconds: Number(event.target.value) })}
            >
              {MATCH_TIMER_START_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {t("lobby.timer.seconds", { seconds })}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
