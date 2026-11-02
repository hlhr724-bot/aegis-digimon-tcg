import { useEffect, useState } from "react";
import { SpectatorAccess } from "@aegis/shared/account/SpectatorAccess";
import { accountApi } from "@/account/client";
import { Switch } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";

type SavePreferencesParams = { spectatorAccess?: SpectatorAccess; shareProfileStats?: boolean };

export function SpectatorAccessSetting() {
  const { t } = useTranslation();
  const [access, setAccess] = useState<SpectatorAccess>(SpectatorAccess.EVERYONE.value);
  const [stats, setStats] = useState(false);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void accountApi
      .preferences()
      .then((preferences) => {
        if (active) {
          setAccess(preferences.spectatorAccess ?? SpectatorAccess.EVERYONE.value);
          setStats(preferences.shareProfileStats === true);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (active) {
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function savePreferences(changes: SavePreferencesParams) {
    setBusy(true);
    setFailed(false);
    try {
      const updated = await accountApi.updatePreferences(changes);
      setAccess(updated.spectatorAccess ?? SpectatorAccess.EVERYONE.value);
      setStats(updated.shareProfileStats === true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-row">
      <label>
        {t("friends.spectatorAccess")}
        <select
          aria-label={t("friends.spectatorAccess")}
          disabled={busy}
          value={access}
          onChange={(event) => {
            const entry = Object.values(SpectatorAccess).find((candidate) => candidate.value === event.target.value);
            if (entry) {
              void savePreferences({ spectatorAccess: entry.value });
            }
          }}
        >
          {Object.values(SpectatorAccess).map((entry) => (
            <option key={entry.value} value={entry.value}>
              {t(`friends.access.${entry.value}`)}
            </option>
          ))}
        </select>
      </label>
      <Switch
        checked={stats}
        disabled={busy}
        label={t("friends.shareStats")}
        onChange={(value) => void savePreferences({ shareProfileStats: value })}
      />
      {failed ? <p role="alert">{t("friends.failed")}</p> : null}
    </div>
  );
}
