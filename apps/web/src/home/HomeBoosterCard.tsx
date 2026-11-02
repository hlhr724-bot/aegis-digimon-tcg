import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { readBoosterProgress } from "@/packOpening/readBoosterProgress";

const DEFAULT_BOOSTER_SET_ID = "BT26";

type HomeBoosterCardParams = {
  onOpen: () => void;
};

export function HomeBoosterCard({ onOpen }: HomeBoosterCardParams) {
  const { t } = useTranslation();
  const box = readBoosterProgress().activeBox;
  const setId = box?.setId ?? DEFAULT_BOOSTER_SET_ID;
  return (
    <section className="home-card home-booster">
      <div className="home-booster__body">
        <span className="home-pack" aria-hidden="true">
          <img src={`/sets/${setId}.jpg`} alt="" loading="lazy" decoding="async" />
          <span className="home-pack__foil" />
          <b className="home-pack__label">{setId}</b>
        </span>
        <div className="home-booster__copy">
          <b>{t("home.booster.title")}</b>
          <small>{t("home.booster.free")}</small>
        </div>
        <Button size="sm" onClick={onOpen}>
          {t("home.booster.open")}
        </Button>
      </div>
    </section>
  );
}
