import { useEffect, useState } from "react";
import { accountApi } from "@/account/client";
import { Switch } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";

export function LiveMatchListingSetting() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void accountApi
      .preferences()
      .then((preferences) => {
        if (!cancelled) {
          setEnabled(preferences.listLiveMatches !== false);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveListing(next: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      const preferences = await accountApi.updatePreferences({ listLiveMatches: next });
      setEnabled(preferences.listLiveMatches !== false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-row">
      <Switch
        checked={enabled}
        disabled={busy || !loaded}
        label={t("settings.listLiveMatches")}
        description={t("settings.listLiveMatchesDesc")}
        onChange={(next) => void saveListing(next)}
      />
      {failed ? <p role="alert">{t("settings.listLiveMatchesFailed")}</p> : null}
    </div>
  );
}
