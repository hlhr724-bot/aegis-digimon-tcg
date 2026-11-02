import type { CSSProperties } from "react";
import { type BoosterBox, BOOSTER_BOX_PACK_COUNT } from "@/packOpening/BoosterProgress";
import { findBestPull } from "@/packOpening/findBestPull";
import { findPackRarity } from "@/packOpening/findPackRarity";
import { getPackCardKey } from "@/packOpening/getPackCardKey";
import type { PackCard } from "@/packOpening/PackCard";

type Props = {
  progress: BoosterBox | undefined;
  availableCards: readonly PackCard[];
  onViewPack: (cards: PackCard[]) => void;
};

export function PackOpeningProgress({ progress, availableCards, onViewPack }: Props) {
  const packs = progress?.packs ?? [];
  const owned = new Set(packs.flatMap((pack) => pack.cards.map(getPackCardKey)));
  const eligible = new Map(availableCards.map((card) => [getPackCardKey(card), card]));
  const collected = [...owned].filter((key) => eligible.has(key)).length;
  const percent = eligible.size === 0 ? 0 : Math.round((collected / eligible.size) * 100);
  return (
    <section className="pack-opening-progress" aria-label="Practice collection">
      <header className="pack-opening-progress__header">
        <div>
          <h2>Current box</h2>
          <p>
            {packs.length} / {BOOSTER_BOX_PACK_COUNT} packs opened
          </p>
        </div>
        <p className="pack-opening-progress__count">
          <span className="pack-opening-progress__value">
            <strong>{collected}</strong> / {eligible.size}
          </span>
          <span>cards and artworks</span>
        </p>
      </header>
      <div
        className="pack-opening-progress__bar"
        role="progressbar"
        aria-label="Set collection progress"
        aria-valuemin={0}
        aria-valuemax={eligible.size}
        aria-valuenow={collected}
        aria-valuetext={`${percent}% collected`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {packs.length > 0 ? (
        <details className="pack-opening-progress__packs">
          <summary>Opened packs ({packs.length})</summary>
          <ul>
            {packs.map((pack, index) => {
              const cards = pack.cards.flatMap((card) => {
                const found = eligible.get(getPackCardKey(card));
                return found ? [found] : [];
              });
              const best = findBestPull(cards);
              const rarity = findPackRarity(best?.rarity);
              const alternateArts = pack.cards.filter((card) => card.artId).length;
              return (
                <li key={index}>
                  <button
                    type="button"
                    className="pack-opening-progress__pack"
                    style={{ "--pack-rarity-color": rarity?.glowColor ?? "var(--ds-line-strong)" } as CSSProperties}
                    onClick={() => onViewPack(cards)}
                  >
                    <span className="pack-opening-progress__pack-name">Pack {index + 1}</span>
                    <span className="pack-opening-progress__pack-meta">
                      <span className="pack-opening-progress__rarity">{rarity?.value ?? "—"}</span>
                      {alternateArts > 0 ? (
                        <span className="pack-opening-progress__badge">{alternateArts} AA</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
