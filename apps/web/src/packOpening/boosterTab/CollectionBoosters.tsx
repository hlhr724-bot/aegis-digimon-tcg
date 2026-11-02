import { useMemo, useState } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import { BOOSTER_BOX_PACK_COUNT } from "@/packOpening/BoosterProgress";
import { BoosterBestPulls } from "@/packOpening/boosterTab/BoosterBestPulls";
import { BoosterLastPack } from "@/packOpening/boosterTab/BoosterLastPack";
import { BoosterOddsCard } from "@/packOpening/boosterTab/BoosterOddsCard";
import { BoosterPackHero } from "@/packOpening/boosterTab/BoosterPackHero";
import { listBestBoxPulls } from "@/packOpening/boosterTab/listBestBoxPulls";
import { listBoosterOdds } from "@/packOpening/boosterTab/listBoosterOdds";
import { listBoosterSetCards } from "@/packOpening/boosterTab/listBoosterSetCards";
import { listOpenedPackCards } from "@/packOpening/boosterTab/listOpenedPackCards";
import { findBestPull } from "@/packOpening/findBestPull";
import { getPackCardKey } from "@/packOpening/getPackCardKey";
import { listBoosterSets } from "@/packOpening/listBoosterSets";
import { useBoosterProgress } from "@/packOpening/useBoosterProgress";
import "@/packOpening/boosterTab/boosterTab.css";

const BEST_PULL_LIMIT = 5;

type CollectionBoostersParams = {
  onOpen?: () => void;
};

export function CollectionBoosters({ onOpen }: CollectionBoostersParams) {
  const { t } = useTranslation();
  const { progress, startBox } = useBoosterProgress();
  const sets = useMemo(listBoosterSets, []);
  const activeBox = progress.activeBox;
  const [selectedSetId, setSelectedSetId] = useState(
    () => sets.find((set) => set.setId === activeBox?.setId)?.setId ?? sets[0]?.setId,
  );
  const boosterSet = sets.find((set) => set.setId === selectedSetId) ?? sets[0];
  const eligible = useMemo(
    () => new Map((boosterSet ? listBoosterSetCards(boosterSet) : []).map((card) => [getPackCardKey(card), card])),
    [boosterSet],
  );
  const odds = useMemo(
    () => (boosterSet ? listBoosterOdds({ setId: boosterSet.setId, cards: boosterSet.cards }) : []),
    [boosterSet],
  );

  if (!boosterSet) {
    return <p className="booster-tab__empty">{t("redesign.collection.booster.empty")}</p>;
  }

  const box = activeBox?.setId === boosterSet.setId ? activeBox : undefined;
  const packs = box?.packs ?? [];
  const lastPack = packs.at(-1);
  const lastPackCards = lastPack ? listOpenedPackCards({ pack: lastPack, eligible }) : [];
  const bestPulls = listBestBoxPulls({ packs, eligible, limit: BEST_PULL_LIMIT });

  const boosterSetId = boosterSet.setId;
  const openPacks = () => {
    if (!box || box.packs.length >= BOOSTER_BOX_PACK_COUNT) {
      startBox(boosterSetId);
    }
    onOpen?.();
  };

  return (
    <div className="booster-tab">
      <div className="booster-tab__main">
        <section className="booster-card booster-stage" aria-label={boosterSet.setId}>
          <BoosterPackHero
            boosterSet={boosterSet}
            sets={sets}
            onSelectSet={setSelectedSetId}
            onOpen={onOpen ? openPacks : undefined}
          />
          {lastPackCards.length > 0 ? (
            <BoosterLastPack cards={lastPackCards} bestPull={findBestPull(lastPackCards)} packNumber={packs.length} />
          ) : null}
        </section>
      </div>
      <aside className="booster-tab__rail">
        <BoosterBestPulls pulls={bestPulls} />
        <BoosterOddsCard odds={odds} />
      </aside>
    </div>
  );
}
