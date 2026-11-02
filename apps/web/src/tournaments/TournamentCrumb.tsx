import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";

type TournamentCrumbParams = { onBack: () => void };

export function TournamentCrumb({ onBack }: TournamentCrumbParams) {
  const { t } = useTranslation();
  return (
    <button type="button" className="tournaments-crumb" onClick={onBack}>
      <Icons.ChevronLeft size={14} aria-hidden="true" />
      {t("tournaments.title")}
    </button>
  );
}
