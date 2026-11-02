import { ManualCombatStage } from "@aegis/shared/manual/ManualCombatStage";
import { useState } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { Seat } from "@aegis/shared/schema/enums";

type Props = {
  state: GameState;
  seat: Seat;
  send: (command: ManualCommand) => void;
  disabled?: boolean;
  spectating?: boolean;
  pendingOnly?: boolean;
  requestOnly?: boolean;
};

export function ManualRestartControls({ state, seat, send, disabled, spectating, pendingOnly, requestOnly }: Props) {
  const { t } = useTranslation();
  const [firstSeat, setFirstSeat] = useState<Seat>(state.turnSeat);
  const table = state.manual;
  if (table.restartRequester !== -1 && requestOnly) {
    return null;
  }
  if (table.restartRequester !== -1) {
    return (
      <section className="manual-table__notice manual-restart" role="status" aria-label={t("manual.restart.title")}>
        <strong>
          {t("manual.restart.pending", { player: state.players[table.restartRequester]?.displayName ?? "" })}
        </strong>
        <p>{t("manual.restart.firstPlayer", { player: state.players[table.restartFirstSeat]?.displayName ?? "" })}</p>
        <p className="manual-table__hint">{t("manual.restart.warning")}</p>
        {!spectating ? (
          <div className="manual-restart__actions">
            {table.restartRequester !== seat ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => send({ action: ManualAction.ANSWER_RESTART.value, accept: true })}
              >
                {t("manual.restart.accept")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => send({ action: ManualAction.ANSWER_RESTART.value, accept: false })}
            >
              {t(table.restartRequester === seat ? "manual.restart.cancel" : "manual.decline")}
            </button>
          </div>
        ) : null}
      </section>
    );
  }
  if (pendingOnly || spectating) {
    return null;
  }
  return (
    <section className="manual-table__group" aria-label={t("manual.restart.title")}>
      <label>
        {t("manual.restart.chooseFirst")}
        <select
          aria-label={t("manual.restart.chooseFirst")}
          value={firstSeat}
          onChange={(event) => setFirstSeat(Number(event.target.value) as Seat)}
        >
          {state.players.map((player) => (
            <option key={player.seat} value={player.seat}>
              {player.displayName}
            </option>
          ))}
        </select>
      </label>
      <p className="manual-table__hint">{t("manual.restart.warning")}</p>
      <button
        type="button"
        disabled={disabled || table.combatStage !== ManualCombatStage.NONE.value}
        onClick={() => send({ action: ManualAction.PROPOSE_RESTART.value, firstSeat })}
      >
        {t("manual.restart.propose")}
      </button>
    </section>
  );
}
