import { PrivateTurnOrder } from "@aegis/shared/protocol/PrivateTurnOrder";
import { getPrivateTurnOrderEntry } from "@aegis/shared/protocol/getPrivateTurnOrderEntry";
import { useId } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import "@/screens/matchTimerSettings.css";

type TurnOrderSettingsParams = {
  turnOrder: PrivateTurnOrder;
  onChange: (turnOrder: PrivateTurnOrder) => void;
};

export function TurnOrderSettings({ turnOrder, onChange }: TurnOrderSettingsParams) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="lobby-timer-settings">
      <div className="lobby-timer-duration">
        <label>
          {t("lobby.turnOrder.label")}
          <select
            value={turnOrder}
            aria-describedby={`${id}-hint`}
            onChange={(event) => onChange(getPrivateTurnOrderEntry({ turnOrder: event.target.value }).value)}
          >
            {Object.values(PrivateTurnOrder).map((entry) => (
              <option key={entry.value} value={entry.value}>
                {t(`lobby.turnOrder.${entry.value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p id={`${id}-hint`} className="lobby-timer-settings__hint">
        {t("lobby.turnOrder.hint")}
      </p>
    </div>
  );
}
