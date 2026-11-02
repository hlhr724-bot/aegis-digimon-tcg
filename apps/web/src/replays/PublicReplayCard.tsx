import "@/replays/publicReplays.css";
import { GameMode } from "@aegis/shared/manual/GameMode";
import type { PublicReplay } from "@aegis/shared/replays/PublicReplay";
import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import type { Translate } from "@/i18n/translationTypes";
import { useTranslation } from "@/i18n/useTranslation";
import { deckFormatLabel } from "@/screens/deckFormatLabel";

const SEATS = [0, 1] as const;

type PublicReplayCardParams = {
  replay: PublicReplay;
  onOpen: (id: string) => void;
};

export function PublicReplayCard({ replay, onOpen }: PublicReplayCardParams) {
  const { t, locale } = useTranslation();
  const first = replay.summary.players[0] || t("log.player", { n: 1 });
  const second = replay.summary.players[1] || t("log.player", { n: 2 });
  const formatLabel = getFormatLabel(replay, t);
  const playedAt = new Date(replay.summary.finishedAt);
  return (
    <li className="public-replay">
      <div className="public-replay__arena">
        <div className="public-replay__artwork" aria-hidden="true">
          {SEATS.map((seat) => (
            <span key={seat} className="public-replay__art">
              <CoverThumb coverCardId={replay.summary.deckIcons?.[seat] ?? undefined} objectPosition="50% 24%" />
            </span>
          ))}
        </div>
        {formatLabel ? <span className="public-replay__badge">{formatLabel}</span> : null}
      </div>
      <p className="public-replay__duel">
        <b title={first}>{first}</b>
        <span className="public-replay__versus">{t("spectator.liveVersus")}</span>
        <b title={second}>{second}</b>
      </p>
      <div className="public-replay__foot">
        <time className="public-replay__date" dateTime={playedAt.toISOString()}>
          <Icons.Clock size={14} aria-hidden="true" />
          {playedAt.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
        </time>
        <Button
          size="sm"
          icon={Icons.Play}
          aria-label={t("publicReplays.watchNamed", { first, second })}
          onClick={() => onOpen(replay.id)}
        >
          {t("spectator.watch")}
        </Button>
      </div>
    </li>
  );
}

function getFormatLabel(replay: PublicReplay, t: Translate): string | undefined {
  if (replay.summary.mode === GameMode.MANUAL.value) {
    return t("manual.title");
  }
  return replay.format ? deckFormatLabel(replay.format, t) : undefined;
}
