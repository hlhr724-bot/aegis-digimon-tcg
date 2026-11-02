import "@/tournaments/tournamentCategories.css";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { Badge } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { TournamentCategoryHelp } from "@/tournaments/TournamentCategoryHelp";

type Props = { category?: TournamentCategory; explained?: boolean };

export function TournamentCategoryBadge({ category = TournamentCategory.COMMUNITY.value, explained = true }: Props) {
  const { t } = useTranslation();
  const official = category === TournamentCategory.OFFICIAL.value;
  const entry =
    Object.values(TournamentCategory).find((option) => option.value === category) ?? TournamentCategory.COMMUNITY;
  const badge = <Badge tone={official ? "primary" : "neutral"}>{t(entry.labelKey)}</Badge>;
  if (!explained) {
    return badge;
  }
  return (
    <span className="tournaments-category-badge">
      {badge}
      <TournamentCategoryHelp category={category} />
    </span>
  );
}
