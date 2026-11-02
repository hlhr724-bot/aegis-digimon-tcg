import { useState } from "react";
import { accountApi } from "@/account/client";
import { buildMatchHistoryCsv } from "@/account/buildMatchHistoryCsv";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n";

type Props = { onError: () => void };

export function ExportMatchHistory({ onError }: Props) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  async function exportHistory() {
    setExporting(true);
    try {
      const { exportedAt, matches } = await accountApi.matchHistoryExport();
      const url = URL.createObjectURL(new Blob([buildMatchHistoryCsv(matches)], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `aegis-match-history-${new Date(exportedAt).toISOString().slice(0, 10)}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      onError();
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      icon={Icons.Download}
      className="profile-export-history"
      disabled={exporting}
      title={t("profile.exportHistory")}
      aria-label={t("profile.exportHistory")}
      onClick={() => void exportHistory()}
    >
      {t("profile.exportHistory")}
    </Button>
  );
}
