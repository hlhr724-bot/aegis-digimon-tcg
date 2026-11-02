import type { LiveMatch } from "@aegis/shared/protocol/LiveMatch";
import { Button, Panel } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { LiveMatchCard } from "@/screens/LiveMatchCard";

type LiveMatchListParams = {
  matches: LiveMatch[];
  total: number;
  now: number;
  onWatch: (spectatorCode: string) => void;
  onShowMore?: () => void;
};

export function LiveMatchList({ matches, total, now, onWatch, onShowMore }: LiveMatchListParams) {
  const { t } = useTranslation();
  if (matches.length === 0) {
    return (
      <Panel pad={0}>
        <div className="live-matches__empty">
          <Icons.Eye size={28} aria-hidden="true" />
          <p>
            <strong>{t("spectator.liveEmpty")}</strong>
          </p>
          <p>{t("spectator.liveEmptyHint")}</p>
        </div>
      </Panel>
    );
  }
  const remaining = total - matches.length;
  return (
    <>
      <ul className="live-matches__grid">
        {matches.map((match) => (
          <LiveMatchCard key={match.spectatorCode} match={match} now={now} onWatch={onWatch} />
        ))}
      </ul>
      {onShowMore && remaining > 0 ? (
        <Button className="live-matches__more" variant="secondary" onClick={onShowMore}>
          {t("spectator.liveShowMore", { count: remaining })}
        </Button>
      ) : null}
    </>
  );
}
