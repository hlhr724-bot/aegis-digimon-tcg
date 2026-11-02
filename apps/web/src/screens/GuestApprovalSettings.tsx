import { useId } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import "@/screens/matchTimerSettings.css";

type GuestApprovalSettingsParams = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export function GuestApprovalSettings({ enabled, onChange }: GuestApprovalSettingsParams) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="lobby-timer-settings">
      <div className="lobby-timer-settings__header">
        <span id={`${id}-label`} className="lobby-timer-settings__label">
          {t("lobby.approval.label")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          className="lobby-timer-switch"
          onClick={() => onChange(!enabled)}
        >
          <span />
        </button>
      </div>
      <p id={`${id}-hint`} className="lobby-timer-settings__hint">
        {t("lobby.approval.hint")}
      </p>
    </div>
  );
}
