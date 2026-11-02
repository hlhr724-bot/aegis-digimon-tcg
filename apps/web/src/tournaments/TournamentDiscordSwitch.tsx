import { useState } from "react";
import { Alert, Switch } from "@/design/primitives";
import { useTranslation } from "@/i18n";
import { tournamentApi } from "@/tournaments/client";

type Props = { id: string; announce: boolean; onChanged: () => void };

export function TournamentDiscordSwitch({ id, announce, onChanged }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Switch
        checked={announce}
        disabled={saving}
        label={t("tournaments.detail.discordAnnounce")}
        description={t("tournaments.detail.discordAnnounceHelp")}
        onChange={(next) => {
          setSaving(true);
          void tournamentApi.setDiscordAnnounce(id, next).then((result) => {
            setSaving(false);
            setFailed(!result.ok);
            if (result.ok) {
              onChanged();
            }
          });
        }}
      />
      {failed ? <Alert tone="danger" title={t("tournaments.error.action")} /> : null}
    </>
  );
}
