import { RankedPlayerDecks } from "@/ranked/RankedPlayerDecks";
import { useEffect, useRef } from "react";
import type { RankedStanding } from "@aegis/shared/ranked/RankedContracts";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";

type Props = { entry: RankedStanding; seasonId: number; format: string; onClose: () => void };

export function RankedPlayerDrawer({ entry, seasonId, format, onClose }: Props) {
  const { t, locale } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog ref={dialog} className="ranked-player-drawer" onClose={onClose} aria-labelledby="ranked-player-title">
      <button
        type="button"
        className="ranked-player-drawer__close"
        onClick={onClose}
        aria-label={t("ranked.player.close")}
      >
        <Icons.X size={24} />
      </button>
      <div className="ranked-player-drawer__identity">
        <div>
          <p className="ranked-eyebrow">{t("ranked.season.player")}</p>
          <h2 id="ranked-player-title">{entry.displayName}</h2>
          <p>{t(`ranked.tier.${entry.tier}`)}</p>
        </div>
      </div>
      <dl className="ranked-meta__totals">
        <div>
          <dt>{t("ranked.season.rating")}</dt>
          <dd>{entry.rating.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>{t("ranked.season.record")}</dt>
          <dd>
            {entry.wins} / {entry.losses} / {entry.draws}
          </dd>
        </div>
        <div>
          <dt>{t("ranked.season.winrate")}</dt>
          <dd>{formatRankedWinrate({ value: entry.winrate, locale })}</dd>
        </div>
      </dl>
      <p className="ranked-muted">
        {t("ranked.season.number", { number: seasonId })} · {format}
      </p>
      <RankedPlayerDecks accountId={entry.accountId} seasonId={seasonId} format={format} />
    </dialog>
  );
}
