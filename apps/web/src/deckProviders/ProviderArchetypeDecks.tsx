import { ProviderSort } from "@aegis/shared/deckProviders/ProviderSort";
import { getProviderDeckListing } from "@/deckProviders/getProviderDeckListing";
import { ProviderFreshness } from "@/deckProviders/ProviderFreshness";
import { DeckListCard } from "@/screens/DeckListCard";
import { getProviderTileListing } from "@/deckProviders/getProviderTileListing";
import { Icons } from "@/design/icons";
import { colorKey } from "@/design/theme";
import { useEffect, useRef, useState } from "react";
import type { ProviderList, ProviderPage } from "@aegis/shared/deckProviders/ProviderTypes";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import { providerApi } from "@/deckProviders/providerApi";
import { ProviderDeckDetail } from "@/deckProviders/ProviderDeckDetail";
import { Button, IconButton, ColorDot } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import type { DeckListing } from "@/game/decks";
import "@/deckProviders/providers.css";

type Props = {
  archetype: number;
  collection: string;
  activeDeckId?: string;
  format?: DeckFormat;
  onInspect?: (id: number) => void;
  onCopy: (deck: DeckListing) => void;
  onUse: (deck: DeckListing) => void;
};

export function ProviderArchetypeDecks({
  archetype,
  collection,
  activeDeckId,
  format = "standard",
  onInspect,
  onCopy,
  onUse,
}: Props) {
  const { t } = useTranslation();
  const [lists, setLists] = useState<ProviderPage<ProviderList>>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<number>();
  const [picking, setPicking] = useState<number>();
  const [pickError, setPickError] = useState("");
  const pickRequest = useRef(0);
  useEffect(() => {
    setPicking(undefined);
    setPickError("");
    return () => {
      pickRequest.current += 1;
    };
  }, [format]);
  async function handlePickDeck(id: number) {
    const request = ++pickRequest.current;
    setPicking(id);
    setPickError("");
    try {
      const detail = await providerApi.detail({ id, format });
      if (request !== pickRequest.current) {
        return;
      }
      const deck = getProviderDeckListing(detail);
      if (!deck || !detail.legality?.legal) {
        setPickError(t(detail.mainDeck ? "digilab.illegal" : "digilab.noList"));
        return;
      }
      onUse(deck);
    } catch {
      if (request === pickRequest.current) {
        setPickError(t("digilab.error"));
      }
    } finally {
      if (request === pickRequest.current) {
        setPicking(undefined);
      }
    }
  }

  useEffect(() => {
    let active = true;
    setLists(undefined);
    setError(false);
    const timer = setTimeout(() => {
      void providerApi
        .lists(
          new URLSearchParams({
            format: collection,
            archetype: String(archetype),
            perPage: "3",
            sort: ProviderSort.DATE.value,
          }),
        )
        .then((result) => {
          if (active) {
            setLists(result);
          }
        })
        .catch(() => {
          if (active) {
            setError(true);
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [collection, archetype, version]);
  return (
    <div className="provider-collection">
      {pickError ? <p role="alert">{pickError}</p> : null}
      {error ? (
        <p role="alert">
          {t("digilab.error")} <Button onClick={() => setVersion((v) => v + 1)}>{t("digilab.retry")}</Button>
        </p>
      ) : !lists ? (
        <p role="status">{t("common.loading")}</p>
      ) : lists.data.length === 0 ? (
        <p>{t("digilab.empty")}</p>
      ) : (
        <>
          <div className="lobby-decks provider-deck-grid">
            {lists.data.slice(0, 3).map((deck) => (
              <div key={deck.id} className="provider-deck-option" aria-busy={picking === deck.id}>
                <DeckListCard
                  deck={getProviderTileListing(deck)}
                  format={format}
                  active={activeDeckId === `provider-${deck.id}`}
                  disabled={picking !== undefined}
                  onSelect={() => void handlePickDeck(deck.id)}
                  subtitle={
                    <span className="provider-list-identity">
                      <span>{[deck.player, deck.format].filter(Boolean).join(" · ")}</span>
                      <span>{[deck.event, deck.date].filter(Boolean).join(" · ")}</span>
                      {deck.placement !== null ? (
                        <span>
                          {t("digilab.placement")}: {deck.placement}
                        </span>
                      ) : null}
                    </span>
                  }
                  actions={
                    <>
                      <span className="deck-color-dots" aria-hidden="true">
                        {deck.colors.map((color) => (
                          <ColorDot key={color} color={colorKey(color)} size={10} />
                        ))}
                      </span>
                      <IconButton
                        size="sm"
                        variant="secondary"
                        label={t("digilab.view")}
                        title={t("digilab.view")}
                        onClick={() => {
                          if (onInspect) {
                            onInspect(deck.id);
                          } else {
                            setSelected(deck.id);
                          }
                        }}
                      >
                        <Icons.Info size={16} />
                      </IconButton>
                      <a
                        className="provider-external-link"
                        href={deck.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t("digilab.source")}
                      >
                        DigiLab <Icons.ExternalLink size={14} />
                      </a>
                    </>
                  }
                />
              </div>
            ))}
          </div>
        </>
      )}
      <ProviderFreshness data={lists} />
      {selected !== undefined ? (
        <ProviderDeckDetail
          id={selected}
          format={format}
          onCopy={onCopy}
          onUse={onUse}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </div>
  );
}
