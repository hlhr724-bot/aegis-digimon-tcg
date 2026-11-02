import { DeckProvider } from "@aegis/shared/deckProviders/DeckProvider";
import { useTranslation } from "@/i18n/useTranslation";

export function ProviderCredit() {
  const { t } = useTranslation();
  return (
    <p className="provider-credit">
      <a href={DeckProvider.DIGILAB.url} target="_blank" rel="noopener noreferrer">
        {t("digilab.credit")}
      </a>
    </p>
  );
}
