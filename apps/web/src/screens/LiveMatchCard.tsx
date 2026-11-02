import { getCardDefinition } from "@aegis/shared";
import { GameMode } from "@aegis/shared/manual/GameMode";
import type { LiveMatch } from "@aegis/shared/protocol/LiveMatch";
import type { LiveMatchPlayerPreview } from "@aegis/shared/protocol/LiveMatchPlayerPreview";
import { CoverThumb } from "@/design/cards";
import { Icons } from "@/design/icons";
import { Avatar, Button } from "@/design/primitives";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { useTranslation } from "@/i18n/useTranslation";
import { deckFormatLabel } from "@/screens/deckFormatLabel";
import "@/screens/liveMatchCard.css";

type LiveMatchCardParams = {
  match: LiveMatch;
  now: number;
  onWatch: (spectatorCode: string) => void;
};

export function LiveMatchCard({ match, now, onWatch }: LiveMatchCardParams) {
  const { t } = useTranslation();
  const first = match.players[0] || t("log.player", { n: 1 });
  const second = match.players[1] || t("log.player", { n: 2 });
  const minutes = Math.max(1, Math.floor((now - match.startedAt) / 60_000));
  return (
    <li className="live-match-card">
      <div className="live-match-card__arena">
        <div className="live-match-card__artwork" aria-hidden="true">
          <LiveMatchCardArt preview={match.playerPreviews?.[0]} />
          <LiveMatchCardArt preview={match.playerPreviews?.[1]} />
        </div>
        <div className="live-match-card__top">
          <span className="live-match-card__live">
            <i aria-hidden="true" />
            {t("home.live.badge")}
          </span>
          <span className="live-match-card__format">
            {match.gameMode === GameMode.MANUAL.value ? t("manual.title") : deckFormatLabel(match.format, t)}
          </span>
        </div>
      </div>
      <div className="live-match-card__duel">
        <LiveMatchCardPlayer name={first} preview={match.playerPreviews?.[0]} />
        <span className="live-match-card__versus">{t("spectator.liveVersus")}</span>
        <LiveMatchCardPlayer name={second} preview={match.playerPreviews?.[1]} />
      </div>
      <div className="live-match-card__foot">
        <span className="live-match-card__stat">
          <Icons.Clock size={14} aria-hidden="true" />
          {t("spectator.liveMinutes", { minutes })}
        </span>
        <span className="live-match-card__stat" aria-label={t("spectator.liveSpectators", { count: match.spectators })}>
          <Icons.Eye size={14} aria-hidden="true" />
          {match.spectators}
        </span>
        <Button
          size="sm"
          icon={Icons.Play}
          aria-label={t("spectator.liveWatch", { first, second })}
          onClick={() => onWatch(match.spectatorCode)}
        >
          {t("spectator.watch")}
        </Button>
      </div>
    </li>
  );
}

type LiveMatchCardPlayerParams = {
  name: string;
  preview?: LiveMatchPlayerPreview;
};

function LiveMatchCardPlayer({ name, preview }: LiveMatchCardPlayerParams) {
  const translations = useCardTranslations();
  const printedName = preview?.cardId ? getCardDefinition(preview.cardId)?.nameEn : undefined;
  const cardName = printedName ? getTranslatedCardName({ name: printedName, translations }) : undefined;
  return (
    <span className="live-match-card__player">
      <Avatar name={name} size={34} avatarId={preview?.avatarId} avatarUrl={preview?.avatarUrl} />
      <span className="live-match-card__identity">
        <b title={name}>{name}</b>
        {cardName ? <small title={cardName}>{cardName}</small> : null}
      </span>
    </span>
  );
}

type LiveMatchCardArtParams = Pick<LiveMatchCardPlayerParams, "preview">;

function LiveMatchCardArt({ preview }: LiveMatchCardArtParams) {
  return (
    <span className="live-match-card__art">
      <CoverThumb coverCardId={preview?.cardId} artId={preview?.artId} objectPosition="50% 24%" />
    </span>
  );
}
