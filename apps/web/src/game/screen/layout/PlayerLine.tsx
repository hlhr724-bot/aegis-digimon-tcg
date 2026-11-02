import { RankedTier } from "@aegis/shared/ranked/RankedTier";
import "@/ranked/ranked.css";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { isDigimonWorldAvatarId } from "@aegis/shared";
import { Avatar } from "../../../design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { useAnchoredTooltip } from "../../useAnchoredTooltip";
import { botPersonaById } from "@aegis/shared/bot/personas/botPersonaById";
import { BotPortrait } from "@/bot/personas/BotPortrait";

export function PlayerLine({
  name,
  avatarId,
  equippedRankedTier,
  botPersonaId,
  side,
  actingLabel,
  maxLength,
  timer,
}: {
  name: string;
  avatarId?: string;
  equippedRankedTier?: string;
  botPersonaId?: string;
  side: "player" | "opponent";
  actingLabel?: string;
  maxLength?: number;
  timer?: ReactNode;
}) {
  const { t } = useTranslation();
  const persona = botPersonaById(botPersonaId);
  const hasRankedFrame = Object.values(RankedTier).some((tier) => tier.value === equippedRankedTier);
  const { tooltipId, open, show, closeSoon, cancelClose } = useAnchoredTooltip<"name">({
    preferAbove: side === "player",
  });
  const characters = Array.from(name);
  const shortened = maxLength !== undefined && characters.length > maxLength;
  return (
    <div
      className="game-player-line"
      data-tier={hasRankedFrame ? equippedRankedTier : undefined}
      data-side={side}
      data-timed={timer ? true : undefined}
      data-acting={actingLabel ? true : undefined}
    >
      <span
        className={`game-player-line__avatar${hasRankedFrame ? " ranked-equipped" : ""}`}
        data-tier={hasRankedFrame ? equippedRankedTier : undefined}
      >
        {persona ? (
          <BotPortrait persona={persona} size={18} />
        ) : (
          <Avatar name={name} avatarId={isDigimonWorldAvatarId(avatarId) ? avatarId : null} size={18} />
        )}
      </span>
      {shortened ? (
        <button
          type="button"
          className="game-player-line__name"
          data-bot={botPersonaId ? true : undefined}
          aria-label={name}
          aria-describedby={open ? tooltipId : undefined}
          onMouseEnter={(event) => show("name", event.currentTarget)}
          onMouseLeave={closeSoon}
          onFocus={(event) => show("name", event.currentTarget)}
          onBlur={closeSoon}
          onClick={(event) => show("name", event.currentTarget)}
        >
          <span className="bot-player-name">{`${characters.slice(0, maxLength - 1).join("")}…`}</span>
          {botPersonaId ? <span className="bot-identity-badge">{t("bot.identity.label")}</span> : null}
        </button>
      ) : (
        <span className="game-player-line__name" data-bot={botPersonaId ? true : undefined}>
          <span className="bot-player-name">{name}</span>
          {botPersonaId ? <span className="bot-identity-badge">{t("bot.identity.label")}</span> : null}
        </span>
      )}
      {actingLabel ? (
        <span className="game-player-line__acting" data-testid={`${side}-acting`}>
          <i aria-hidden="true" />
          <span className="game-player-line__acting-text">{actingLabel}</span>
        </span>
      ) : null}
      {timer}
      {open &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            className="game-anchored-tooltip"
            data-above={open.above}
            style={{ left: open.left, top: open.top }}
            onMouseEnter={cancelClose}
            onMouseLeave={closeSoon}
          >
            {name}
          </span>,
          document.body,
        )}
    </div>
  );
}
