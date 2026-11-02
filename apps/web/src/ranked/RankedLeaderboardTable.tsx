import { useState } from "react";
import { Icons } from "@/design/icons";
import { RankedPlayerDrawer } from "@/ranked/RankedPlayerDrawer";
import type { RankedLeaderboard, RankedStanding } from "@aegis/shared/ranked/RankedContracts";
import { useTranslation } from "@/i18n/useTranslation";
import { RankedPodium } from "@/ranked/RankedPodium";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";

type Props = { data: RankedLeaderboard; format: string };
type RowProps = { entry: RankedStanding; mine: boolean; onSelect: (entry: RankedStanding) => void };

const PODIUM_SIZE = 3;

export function RankedLeaderboardTable({ data, format }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<RankedStanding | null>(null);
  const mineId = data.mine?.accountId;
  const podium =
    data.page === 1
      ? data.entries.filter((entry) => entry.position !== null && entry.position <= PODIUM_SIZE).slice(0, PODIUM_SIZE)
      : [];
  const rows = data.entries.filter((entry) => !podium.includes(entry));
  const detachedMine =
    data.mine && data.mine.position !== null && !data.entries.some((entry) => entry.accountId === mineId)
      ? data.mine
      : null;
  if (!data.entries.length) {
    return <p className="ranked-empty">{t("ranked.season.empty")}</p>;
  }
  return (
    <>
      {podium.length ? <RankedPodium entries={podium} mineId={mineId} onSelect={setSelected} /> : null}
      {rows.length || detachedMine ? (
        <div className="ranked-table-scroll" tabIndex={0} role="region" aria-label={t("ranked.season.leaderboard")}>
          <table className="ranked-table ranked-board">
            <caption>{t("ranked.season.leaderboard")}</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{t("ranked.season.player")}</th>
                <th scope="col">{t("ranked.player.decks")}</th>
                <th scope="col" className="ranked-board__numeric">
                  {t("ranked.season.rating")}
                </th>
                <th scope="col" className="ranked-board__numeric ranked-board__record">
                  {t("ranked.season.record")}
                </th>
                <th scope="col" className="ranked-board__winrate">
                  {t("ranked.season.winrate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <RankedLeaderboardRow
                  key={entry.accountId}
                  entry={entry}
                  mine={entry.accountId === mineId}
                  onSelect={setSelected}
                />
              ))}
              {detachedMine ? (
                <>
                  <tr className="ranked-board__gap" aria-hidden="true">
                    <td colSpan={6}>⋯</td>
                  </tr>
                  <RankedLeaderboardRow entry={detachedMine} mine onSelect={setSelected} />
                </>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {selected ? (
        <RankedPlayerDrawer
          key={`${selected.accountId}:${data.season.id}:${format}`}
          seasonId={data.season.id}
          format={format}
          entry={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function RankedLeaderboardRow({ entry, mine, onSelect }: RowProps) {
  const { t, locale } = useTranslation();
  return (
    <tr data-mine={mine || undefined}>
      <td className="ranked-board__position">{entry.position ?? "—"}</td>
      <th scope="row">
        <div className="ranked-board__player">
          <span className="ranked-avatar ranked-equipped" data-tier={entry.tier} aria-hidden="true">
            {entry.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>
              {entry.displayName}
              {mine ? <span className="ranked-you">{t("ranked.season.you")}</span> : null}
            </strong>
            {entry.provisional ? (
              <span className="ranked-muted">{t("ranked.season.provisional", { games: entry.games })}</span>
            ) : null}
          </div>
        </div>
      </th>
      <td>
        <button
          className="ranked-deck-link"
          type="button"
          onClick={() => onSelect(entry)}
          aria-label={t("ranked.player.view", { player: entry.displayName })}
        >
          <Icons.PanelDeck size={14} />
          {t("ranked.player.decks")}
          <Icons.ChevronRight size={16} />
        </button>
      </td>
      <td className="ranked-board__numeric ranked-board__rating">{entry.rating.toLocaleString(locale)}</td>
      <td className="ranked-board__numeric ranked-board__record">
        {entry.wins} / {entry.losses} / {entry.draws}
      </td>
      <td className="ranked-board__winrate">
        <span className="ranked-winrate">
          <span>{formatRankedWinrate({ value: entry.winrate, locale })}</span>
          <span className="ranked-winrate__bar" aria-hidden="true">
            <span style={{ inlineSize: `${(entry.winrate ?? 0) * 100}%` }} />
          </span>
        </span>
      </td>
    </tr>
  );
}
