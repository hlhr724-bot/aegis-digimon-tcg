import type { ProviderArchetype } from "@aegis/shared/deckProviders/ProviderTypes";
import { DeckListCard } from "@/screens/DeckListCard";
import { ColorDot, IconButton } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { colorKey } from "@/design/theme";
import { useTranslation } from "@/i18n/useTranslation";

type Props = {
  archetype: ProviderArchetype;
  collection: string;
  active: boolean;
  busy: boolean;
  disabled: boolean;
  selectedName?: string;
  onSelect: () => void;
  onInfo: () => void;
};

export function ProviderArchetypeCard({
  archetype,
  collection,
  active,
  busy,
  disabled,
  selectedName,
  onSelect,
  onInfo,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="provider-deck-option" aria-busy={busy}>
      <DeckListCard
        deck={{
          id: `archetype-${archetype.id}`,
          name: archetype.name,
          color: colorKey(archetype.colors[0]),
          mainDeck: [],
          eggDeck: [],
          blurb: collection,
          coverCardId: archetype.coverCardId,
        }}
        active={active}
        disabled={disabled}
        onSelect={onSelect}
        subtitle={
          <span className="provider-list-identity">
            <span>
              {collection}
              {archetype.deckCount !== null && archetype.deckCount !== undefined
                ? ` · ${t("digilab.listCount", { count: archetype.deckCount })}`
                : ""}
            </span>
            {selectedName ? <span>{selectedName}</span> : null}
          </span>
        }
        actions={
          <>
            <span className="provider-card-stats">
              {archetype.share !== null ? (
                <span>
                  {t("digilab.share")} <strong>{archetype.share}%</strong>
                </span>
              ) : null}
              {archetype.winRate !== null ? (
                <span>
                  {t("digilab.winRate")} <strong>{archetype.winRate}%</strong>
                </span>
              ) : null}
            </span>
            <span className="deck-color-dots" aria-hidden="true">
              {archetype.colors.map((color) => (
                <ColorDot key={color} color={colorKey(color)} size={10} />
              ))}
            </span>
            <button type="button" className="provider-select-hint" disabled={disabled} onClick={onSelect}>
              <Icons.Swords size={14} />
              {t("digilab.select")}
            </button>
            <IconButton
              size="sm"
              variant="secondary"
              label={`${t("digilab.versions")} · ${archetype.name}`}
              title={t("digilab.versions")}
              onClick={onInfo}
            >
              <Icons.Info size={16} />
            </IconButton>
          </>
        }
      />
    </div>
  );
}
