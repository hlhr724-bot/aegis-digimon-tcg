import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useEffect, useState, type CSSProperties } from "react";
import { useCardImageUrls } from "@/design/tokenArt/useCardImageUrls";
import { CardBack } from "../design/cards";
import { securityCardEffects } from "./securityCardEffects";
import { motionPreference } from "@/design/motion/motionPreference";

export const SECURITY_FLIP_DURATION = 420;

type PublicCard = { cardId: string; artId?: string; faceUp: boolean };

export function SecurityCardSlot({
  cardId = "",
  artId,
  faceUp = false,
  stackDepth,
  useSelectedSleeve = false,
}: Partial<PublicCard> & { stackDepth?: number; useSelectedSleeve?: boolean }) {
  const getCardName = useTranslatedCardName();
  const reducedMotion = motionPreference.useReduced();
  const [previous, setPrevious] = useState<PublicCard>({ cardId, artId, faceUp });
  const [turningDown, setTurningDown] = useState<PublicCard | null>(null);
  // Keep a value snapshot: Colyseus can mutate the original instance in place and
  // redact its identity in the same patch that changes faceUp.
  if (previous.cardId !== cardId || previous.artId !== artId || previous.faceUp !== faceUp) {
    if (previous.faceUp && previous.cardId && !faceUp && !reducedMotion) setTurningDown(previous);
    else if (faceUp || reducedMotion) setTurningDown(null);
    setPrevious({ cardId, artId, faceUp });
  }
  useEffect(() => {
    if (!turningDown) return;
    const timer = window.setTimeout(() => setTurningDown(null), SECURITY_FLIP_DURATION);
    return () => window.clearTimeout(timer);
  }, [turningDown]);
  const publicCard = faceUp && cardId ? { cardId, artId } : turningDown;
  const [publicCardUrl] = useCardImageUrls({ cardId: publicCard?.cardId, artId: publicCard?.artId });
  return (
    <i
      className={
        [publicCard ? "game-security-card--revealed" : "", turningDown ? "game-security-card--turning-down" : ""]
          .filter(Boolean)
          .join(" ") || undefined
      }
      style={{ "--security-flip-duration": `${SECURITY_FLIP_DURATION}ms`, zIndex: stackDepth } as CSSProperties}
    >
      {publicCard ? (
        <span className="game-security-card__faces" aria-hidden={!faceUp || undefined}>
          <img src={publicCardUrl} alt={getCardName(publicCard.cardId)} />
          {turningDown ? (
            <span className="game-security-card__back">
              <CardBack width={64} useSelectedSleeve={useSelectedSleeve} />
            </span>
          ) : null}
        </span>
      ) : null}
      {/* Only layouts that draw security as cards show the sleeve; the others keep the shield. */}
      {publicCard ? null : (
        <span className="game-security-card__sleeve" aria-hidden>
          <CardBack width={64} useSelectedSleeve={useSelectedSleeve} />
        </span>
      )}
      {faceUp && cardId
        ? securityCardEffects(cardId).map((effect) => (
            <span className="game-security-card__buff" key={effect.text} title={effect.text}>
              {effect.badge}
            </span>
          ))
        : null}
    </i>
  );
}
