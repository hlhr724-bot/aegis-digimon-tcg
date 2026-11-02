import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { BOOSTER_PACK_CARD_COUNT } from "@/packOpening/BoosterPackSlots";
import type { BoosterSet } from "@/packOpening/listBoosterSets";

type BoosterPackHeroParams = {
  boosterSet: BoosterSet;
  sets: readonly BoosterSet[];
  onSelectSet: (setId: string) => void;
  onOpen?: () => void;
};

export function BoosterPackHero({ boosterSet, sets, onSelectSet, onOpen }: BoosterPackHeroParams) {
  const { t } = useTranslation();
  return (
    <div className="booster-hero">
      <span className="booster-pack" aria-hidden="true">
        <img src={boosterSet.coverUrl} alt="" decoding="async" />
        <span className="booster-pack__foil" />
        <b className="booster-pack__label">{boosterSet.setId}</b>
      </span>
      <div className="booster-hero__info">
        <span className="booster-hero__eyebrow">{t("redesign.collection.booster.eyebrow")}</span>
        <h2>{t("redesign.collection.booster.title", { set: boosterSet.setId })}</h2>
        <div className="booster-facts">
          <span>
            <Icons.Cards size={14} aria-hidden="true" />
            {t("redesign.collection.booster.cardsPerPack", { count: BOOSTER_PACK_CARD_COUNT })}
          </span>
        </div>
        <div className="booster-hero__actions">
          {onOpen ? (
            <Button size="lg" icon={Icons.Package} onClick={onOpen}>
              {t("redesign.collection.booster.open")}
            </Button>
          ) : null}
          <label className="booster-hero__set">
            <span>{t("library.set")}</span>
            <select value={boosterSet.setId} onChange={(event) => onSelectSet(event.target.value)}>
              {sets.map((set) => (
                <option key={set.setId} value={set.setId}>
                  {set.setId}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
