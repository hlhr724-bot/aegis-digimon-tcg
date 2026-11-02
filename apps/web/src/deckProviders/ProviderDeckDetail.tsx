import { ProviderFreshness } from "@/deckProviders/ProviderFreshness";
import { useEffect, useState } from "react";
import type { ProviderDetail } from "@aegis/shared/deckProviders/ProviderTypes";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import { ProviderCardGallery } from "@/deckProviders/ProviderCardGallery";
import { Icons } from "@/design/icons";
import { providerApi } from "@/deckProviders/providerApi";
import { getProviderDeckListing } from "@/deckProviders/getProviderDeckListing";
import { ProviderCredit } from "@/deckProviders/ProviderCredit";
import { Button, Dialog } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import type { DeckListing } from "@/game/decks";

type Props = {
  id: number;
  format: DeckFormat;
  onClose: () => void;
  onCopy: (deck: DeckListing) => void;
  onUse: (deck: DeckListing) => void;
};

export function ProviderDeckDetail({ id, format, onClose, onCopy, onUse }: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ProviderDetail>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setDetail(undefined);
    setError(false);
    void providerApi
      .detail({ id, format })
      .then((result) => {
        if (active) {
          setDetail(result);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [id, format, version]);
  const deck = detail ? getProviderDeckListing(detail) : null;
  return (
    <Dialog className="provider-dialog provider-detail-dialog" labelledBy="provider-detail-title" onClose={onClose}>
      <header>
        <h2 id="provider-detail-title">{detail?.name ?? "DigiLab"}</h2>
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </header>
      {error ? (
        <p role="alert">
          {t("digilab.error")} <Button onClick={() => setVersion((v) => v + 1)}>{t("digilab.retry")}</Button>
        </p>
      ) : !detail ? (
        <p role="status">{t("common.loading")}</p>
      ) : (
        <>
          <div className="provider-detail-summary">
            <p className="provider-detail-summary__identity">
              {[detail.player, detail.format].filter(Boolean).join(" · ")}
            </p>
            <p>{[detail.event, detail.date].filter(Boolean).join(" · ")}</p>
            <dl className="provider-detail-stats">
              <div>
                <dt>{t("digilab.placement")}</dt>
                <dd>{detail.placement === null ? "—" : `#${detail.placement}`}</dd>
              </div>
              <div>
                <dt>{t("digilab.record")}</dt>
                <dd>
                  {detail.wins ?? "—"} / {detail.losses ?? "—"} / {detail.ties ?? "—"}
                </dd>
              </div>
            </dl>
            <div className="provider-controls">
              <a className="provider-external-link" href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">
                {t("digilab.source")} <Icons.ExternalLink size={14} />
              </a>
              {detail.externalUrl ? (
                <a
                  className="provider-external-link"
                  href={detail.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("digilab.original")} <Icons.ExternalLink size={14} />
                </a>
              ) : null}
            </div>
          </div>
          {!detail.mainDeck ? (
            <p>{t("digilab.noList")}</p>
          ) : (
            <>
              <p>{t("digilab.cardCounts", { main: detail.mainDeck.length, eggs: detail.eggDeck?.length ?? 0 })}</p>
              <ProviderCardGallery title={t("digilab.eggs")} cards={detail.eggDeck ?? []} />
              <ProviderCardGallery title={t("digilab.main")} cards={detail.mainDeck} />
            </>
          )}
          {detail.legality && !detail.legality.legal ? (
            <div role="status">
              <p>{t("digilab.illegal")}</p>
              {detail.legality.unknownCards.length > 0 ? (
                <p>
                  {t("digilab.unknown")}: {detail.legality.unknownCards.join(", ")}
                </p>
              ) : null}
              <ul>
                {detail.legality.formatViolations.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {detail.legality.banViolations.map(([card, count]) => (
                  <li key={card}>
                    {card}: {count} ×
                  </li>
                ))}
                {detail.legality.pairViolations.map((pair) => (
                  <li key={pair.join()}>{pair.join(" + ")}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="provider-controls provider-detail-actions">
            <Button
              disabled={!deck || !detail.legality?.legal}
              onClick={() => {
                if (deck) {
                  onUse(deck);
                  onClose();
                }
              }}
            >
              {t("digilab.use")}
            </Button>
            <Button
              variant="secondary"
              disabled={!deck}
              onClick={() => {
                if (deck) {
                  onCopy(deck);
                  onClose();
                }
              }}
            >
              {t("digilab.copy")}
            </Button>
          </div>
          <ProviderFreshness data={detail} />
          <ProviderCredit />
        </>
      )}
    </Dialog>
  );
}
