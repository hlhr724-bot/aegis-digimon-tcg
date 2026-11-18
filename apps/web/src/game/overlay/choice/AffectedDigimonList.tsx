import type { Permanent } from "@aegis/shared";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { CardMini } from "@/design/cards";
import { formatFieldReference } from "@/design/fieldReference/formatFieldReference";
import { useFieldReferenceVisible } from "@/design/fieldReference/useFieldReferenceVisible";
import { useTranslation } from "@/i18n/useTranslation";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import "@/game/overlay/choice/affectedDigimonList.css";

type AffectedDigimonListParams = {
  permanentIds: readonly string[] | undefined;
  permanents: readonly Permanent[];
};

type AffectedDigimon = { permanentId: string; cardId: string; artId?: string; sharesName: boolean };

function findAffectedDigimon({ permanentIds, permanents }: AffectedDigimonListParams): AffectedDigimon[] {
  return (permanentIds ?? []).flatMap((permanentId) => {
    const permanent = permanents.find((candidate) => candidate.permanentId === permanentId);
    const top = permanent?.topCard;
    if (permanent === undefined || !top?.cardId || top.faceUp === false) {
      return [];
    }
    const name = getCardDefinition(top.cardId)?.nameEn;
    const sharesName = permanents.some(
      (other) =>
        other.permanentId !== permanentId &&
        other.controllerSeat === permanent.controllerSeat &&
        other.topCard?.faceUp !== false &&
        getCardDefinition(other.topCard?.cardId ?? "")?.nameEn === name,
    );
    return [{ permanentId, cardId: top.cardId, ...(top.artId ? { artId: top.artId } : {}), sharesName }];
  });
}

export function AffectedDigimonList({ permanentIds, permanents }: AffectedDigimonListParams) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const fieldReferenceVisible = useFieldReferenceVisible();
  const affected = findAffectedDigimon({ permanentIds, permanents });
  if (affected.length === 0) {
    return null;
  }
  const label = t("overlay.affectedDigimon");
  return (
    <div className="affected-digimon" role="group" aria-label={label}>
      <span className="affected-digimon__label">{label}</span>
      <ul className="affected-digimon__list">
        {affected.map(({ permanentId, cardId, artId, sharesName }) => (
          <li key={permanentId} className="affected-digimon__item" data-permanent-id={permanentId}>
            <span className="affected-digimon__art" aria-hidden="true">
              <CardMini cardId={cardId} artId={artId} width={32} zoomOnHover={false} />
            </span>
            <span className="affected-digimon__name">
              {[
                getCardName(cardId),
                fieldReferenceVisible || sharesName ? formatFieldReference(permanentId) : undefined,
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
