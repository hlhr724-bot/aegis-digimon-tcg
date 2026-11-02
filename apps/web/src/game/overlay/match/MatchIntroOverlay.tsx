import { useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { isDigimonWorldAvatarId } from "@aegis/shared/account/avatars";
import { Avatar } from "@/design/primitives";
import { PixelBackdrop } from "@/design/PixelBackdrop";
import { BotPortrait } from "@/bot/personas/BotPortrait";
import { botPersonaById } from "@aegis/shared/bot/personas/botPersonaById";
import { useTranslation } from "@/i18n/useTranslation";
import { MATCH_INTRO_LEAVE_MS } from "@/game/screen/hooks/useMatchIntro";
import "@/game/overlay/match/matchIntro.css";

export type MatchIntroPlayer = {
  name: string;
  avatarId?: string;
  botPersonaId?: string;
};

type MatchIntroOverlayProps = {
  viewer: MatchIntroPlayer;
  opponent: MatchIntroPlayer | undefined;
  leaving: boolean;
  onSkip: () => void;
};

const SKIP_KEYS = new Set(["Escape", "Enter", " "]);

export function MatchIntroOverlay({ viewer, opponent, leaving, onSkip }: MatchIntroOverlayProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const skipOnKey = (event: KeyboardEvent) => {
      if (SKIP_KEYS.has(event.key)) {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", skipOnKey);
    return () => window.removeEventListener("keydown", skipOnKey);
  }, [onSkip]);

  const style = { "--match-intro-leave": `${MATCH_INTRO_LEAVE_MS}ms` } as CSSProperties;
  const announcement = opponent
    ? t("matchIntro.label", { you: viewer.name, opponent: opponent.name })
    : t("game.waitingBot");
  const overlay = (
    <div
      className={`match-intro${leaving ? " match-intro--leaving" : ""}`}
      style={style}
      data-testid="match-intro"
      onClick={onSkip}
    >
      <div className="match-intro__backdrop" aria-hidden="true" />
      <PixelBackdrop />
      <div className="match-intro__burst" aria-hidden="true" />
      <p className="match-intro__announcement" role="status">
        {announcement}
      </p>
      <MatchIntroBar side="viewer" player={viewer} />
      <div className="match-intro__badge" aria-hidden="true">
        <span className="match-intro__ring" />
        <span className="match-intro__letter match-intro__letter--v">V</span>
        <span className="match-intro__letter match-intro__letter--s">S</span>
      </div>
      {opponent ? (
        <MatchIntroBar side="opponent" player={opponent} />
      ) : (
        <div className="match-intro__bar match-intro__bar--opponent match-intro__bar--pending" aria-hidden="true">
          <span className="match-intro__pending-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      <button type="button" className="match-intro__skip" onClick={onSkip}>
        {t("matchIntro.skip")}
      </button>
    </div>
  );
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}

type MatchIntroBarProps = {
  side: "viewer" | "opponent";
  player: MatchIntroPlayer;
};

function MatchIntroBar({ side, player }: MatchIntroBarProps) {
  const persona = botPersonaById(player.botPersonaId);
  return (
    <div className={`match-intro__bar match-intro__bar--${side}`} aria-hidden="true">
      <span className="match-intro__avatar">
        {persona ? (
          <BotPortrait persona={persona} size={64} />
        ) : (
          <Avatar
            name={player.name}
            avatarId={isDigimonWorldAvatarId(player.avatarId) ? player.avatarId : null}
            size={64}
          />
        )}
      </span>
      <span className="match-intro__name">{player.name}</span>
      <span className="match-intro__shards">
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
