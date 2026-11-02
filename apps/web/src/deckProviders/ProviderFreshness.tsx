import type { ProviderFreshness as Freshness } from "@aegis/shared/deckProviders/ProviderTypes";
import { useTranslation } from "@/i18n/useTranslation";

type Props = { data?: Freshness };

export function ProviderFreshness({ data }: Props) {
  const { t, locale } = useTranslation();
  if (!data?.stale || !data.collectedAt) {
    return null;
  }
  return <p role="status">{t("digilab.stale", { date: new Date(data.collectedAt).toLocaleString(locale) })}</p>;
}
