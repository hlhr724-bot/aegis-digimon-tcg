import { useEffect, useState } from "react";
import type { Trophy, TrophyCabinet as TrophyCabinetData } from "@aegis/shared/achievements/TrophyContracts";
import { TrophySourceKind } from "@aegis/shared/achievements/TrophySourceKind";
import type { TrophyTier } from "@aegis/shared/achievements/TrophyTier";
import { request } from "@/account/client";
import { useTranslation } from "@/i18n/useTranslation";
import type { Translate } from "@/i18n/translationTypes";
import "@/achievements/trophies.css";

type Props = { accountId: string };
type LoadState = { accountId: string; cabinet?: TrophyCabinetData; failed: boolean };

export function TrophyCabinet({ accountId }: Props) {
  const { t, locale } = useTranslation();
  const [state, setState] = useState<LoadState>({ accountId, failed: false });
  useEffect(() => {
    let active = true;
    request<TrophyCabinetData>("/achievements/trophies")
      .then((cabinet) => {
        if (active) {
          setState({ accountId, cabinet, failed: false });
        }
      })
      .catch(() => {
        if (active) {
          setState({ accountId, failed: true });
        }
      });
    return () => {
      active = false;
    };
  }, [accountId]);
  const current = state.accountId === accountId ? state : { accountId, failed: false };
  const dateFormat = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });
  return (
    <section className="trophy-cabinet" aria-labelledby="trophy-cabinet-title">
      <header className="trophy-cabinet__header">
        <div>
          <h2 id="trophy-cabinet-title">{t("achievements.trophies.title")}</h2>
          <p>{t("achievements.trophies.description")}</p>
        </div>
        {current.cabinet && current.cabinet.items.length > 0 ? (
          <span className="trophy-cabinet__count">{current.cabinet.items.length.toLocaleString(locale)}</span>
        ) : null}
      </header>
      {current.failed ? <p role="alert">{t("achievements.trophies.error")}</p> : null}
      {!current.cabinet && !current.failed ? <p role="status">{t("common.loading")}</p> : null}
      {current.cabinet?.items.length === 0 ? (
        <p className="trophy-cabinet__empty">{t("achievements.trophies.empty")}</p>
      ) : null}
      {current.cabinet && current.cabinet.items.length > 0 ? (
        <ul className="trophy-cabinet__list">
          {current.cabinet.items.map((trophy) => {
            const tier = t(`achievements.tier.${trophy.tier}`);
            const source = getSourceLabel(trophy, t);
            const date = t("achievements.trophies.awardedOn", { date: dateFormat.format(trophy.awardedAt) });
            return (
              <li
                className="trophy-cabinet__item"
                data-tier={trophy.tier}
                key={`${trophy.source.kind}:${getSourceKey(trophy)}`}
                title={`${tier} · ${source} · ${date}`}
              >
                <div className="trophy-cabinet__display">
                  <img
                    className="trophy-cabinet__image"
                    src={getTrophyImage(trophy.tier, 128)}
                    srcSet={`${getTrophyImage(trophy.tier, 128)} 128w, ${getTrophyImage(trophy.tier, 256)} 256w`}
                    sizes="64px"
                    width={64}
                    height={64}
                    alt={tier}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="trophy-cabinet__text">
                  <strong>{tier}</strong>
                  <span>{source}</span>
                  <time dateTime={new Date(trophy.awardedAt).toISOString()}>{date}</time>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function getTrophyImage(tier: TrophyTier, size: 128 | 256): string {
  return `/trophies/trophy-${tier}-${size}.webp`;
}

function getSourceKey(trophy: Trophy): string {
  return trophy.source.kind === TrophySourceKind.TOURNAMENT_CIRCUIT.value
    ? trophy.source.circuitId
    : trophy.source.tournamentId;
}

function getSourceLabel(trophy: Trophy, t: Translate): string {
  return `${t(`achievements.award.${trophy.award}`)} · ${trophy.source.name}`;
}
