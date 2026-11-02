import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { HelpTip } from "@/design/HelpTip";
import { useTranslation } from "@/i18n/useTranslation";
import { TournamentCatalogSection } from "@/tournaments/TournamentCatalogSection";

type Props = { category?: TournamentCategory };

export function TournamentCategoryHelp({ category = TournamentCategory.COMMUNITY.value }: Props) {
  const { t } = useTranslation();
  const section =
    Object.values(TournamentCatalogSection).find((entry) => entry.value === category) ??
    TournamentCatalogSection.COMMUNITY;
  return (
    <HelpTip label={t(section.helpLabelKey)}>
      <p>{t(section.explanationKey)}</p>
    </HelpTip>
  );
}
