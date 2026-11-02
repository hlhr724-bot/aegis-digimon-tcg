import { useEffect, useState } from "react";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { ProviderArchetype, ProviderPage } from "@aegis/shared/deckProviders/ProviderTypes";
import type { DeckListing } from "@/game/decks";
import { providerApi } from "@/deckProviders/providerApi";
import { ProviderArchetypeCard } from "@/deckProviders/ProviderArchetypeCard";
import { ProviderArchetypeDialog } from "@/deckProviders/ProviderArchetypeDialog";
import { getProviderDeckListing } from "@/deckProviders/getProviderDeckListing";
import { ProviderFreshness } from "@/deckProviders/ProviderFreshness";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import "@/deckProviders/providers.css";

type Props = {
  search: string;
  collection: string;
  activeDeckId?: string;
  format?: DeckFormat;
  onCopy: (deck: DeckListing) => void;
  onUse: (deck: DeckListing) => void;
};

export function ProviderDeckBrowser({ search, collection, activeDeckId, format = "standard", onCopy, onUse }: Props) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<ProviderPage<ProviderArchetype>>();
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [inspected, setInspected] = useState<ProviderArchetype>();
  const [pickError, setPickError] = useState("");
  const [selection, setSelection] = useState<{ archetype: number; deckId: string; name: string }>();
  function handleUse(archetype: ProviderArchetype, deck: DeckListing) {
    setSelection({ archetype: archetype.id, deckId: deck.id, name: deck.blurb });
    onUse({ ...deck, coverCardId: archetype.coverCardId ?? deck.coverCardId });
  }
  function handleSelect(archetype: ProviderArchetype) {
    setPickError("");
    const deck = archetype.playableDeck ? getProviderDeckListing(archetype.playableDeck) : null;
    if (!deck || !archetype.playableDeck?.legality?.legal) {
      setPickError(t("digilab.noPlayableVersion"));
      return;
    }
    handleUse(archetype, deck);
  }
  useEffect(() => {
    let current = true;
    setMeta(undefined);
    setError(false);
    void providerApi
      .meta(new URLSearchParams({ format: collection, perPage: "25", playFormat: format }))
      .then((result) => {
        if (current) {
          setMeta(result);
        }
      })
      .catch(() => {
        if (current) {
          setError(true);
        }
      });
    return () => {
      current = false;
    };
  }, [collection, format, version]);
  const query = search.trim().toLocaleLowerCase();
  const archetypes = (meta?.data ?? [])
    .slice(0, 25)
    .filter((item) => [item.name, collection, ...item.colors].join(" ").toLocaleLowerCase().includes(query));
  return (
    <div className="provider-collection">
      {error ? (
        <p role="alert">
          {t("digilab.error")} <Button onClick={() => setVersion((value) => value + 1)}>{t("digilab.retry")}</Button>
        </p>
      ) : !meta ? (
        <p role="status">{t("common.loading")}</p>
      ) : (
        <>
          <p className="provider-collection__count">{t("digilab.archetypeCount", { count: archetypes.length })}</p>
          {archetypes.length === 0 ? <p>{t("digilab.empty")}</p> : null}
          <p className="provider-collection__hint">{t("digilab.selectHint")}</p>
          {pickError ? <p role="alert">{pickError}</p> : null}
          <div className="lobby-decks provider-archetype-grid">
            {archetypes.map((archetype) => (
              <ProviderArchetypeCard
                key={archetype.id}
                archetype={archetype}
                collection={collection}
                active={selection?.archetype === archetype.id && selection.deckId === activeDeckId}
                busy={false}
                disabled={false}
                selectedName={selection?.archetype === archetype.id ? selection.name : undefined}
                onSelect={() => void handleSelect(archetype)}
                onInfo={() => setInspected(archetype)}
              />
            ))}
          </div>
        </>
      )}
      <ProviderFreshness data={meta} />
      {inspected ? (
        <ProviderArchetypeDialog
          archetype={inspected}
          collection={collection}
          activeDeckId={activeDeckId}
          format={format}
          onUse={(deck) => handleUse(inspected, deck)}
          onCopy={(deck) => onCopy({ ...deck, coverCardId: inspected.coverCardId ?? deck.coverCardId })}
          onClose={() => setInspected(undefined)}
        />
      ) : null}
    </div>
  );
}
