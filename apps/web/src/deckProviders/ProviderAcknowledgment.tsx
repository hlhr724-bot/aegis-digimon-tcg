import { DeckProvider } from "@aegis/shared/deckProviders/DeckProvider";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";

export function ProviderAcknowledgment() {
  const { t } = useTranslation();
  return (
    <aside className="provider-acknowledgment">
      <Icons.Heart size={20} />
      <div>
        <strong>{t("digilab.thanks")}</strong>
        <p>{t("digilab.thanksDescription")}</p>
      </div>
      <a className="provider-external-link" href={DeckProvider.DIGILAB.url} target="_blank" rel="noopener noreferrer">
        {t("digilab.visit")} <Icons.ExternalLink size={16} />
      </a>
    </aside>
  );
}
