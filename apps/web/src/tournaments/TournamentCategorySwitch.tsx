import { useState } from "react";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { Alert, Switch } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { tournamentApi } from "@/tournaments/client";

type Props = { id: string; category?: TournamentCategory; onChanged: () => void };

export function TournamentCategorySwitch({ id, category, onChanged }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function saveCategory(official: boolean) {
    setSaving(true);
    setFailed(false);
    try {
      const next = official ? TournamentCategory.OFFICIAL.value : TournamentCategory.COMMUNITY.value;
      const result = await tournamentApi.setCategory(id, next);
      setFailed(!result.ok);
      if (result.ok) {
        onChanged();
      }
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Switch
        checked={category === TournamentCategory.OFFICIAL.value}
        disabled={saving}
        label={t("tournaments.category.official")}
        description={t("tournaments.category.help")}
        onChange={(official) => void saveCategory(official)}
      />
      {failed ? <Alert tone="danger" title={t("tournaments.error.action")} /> : null}
    </>
  );
}
