import type { CSSProperties } from "react";
import { COLORS, colorKey } from "@/design/theme";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { CardBack, CardFull } from "@/design/cards";
import { useTranslation } from "@/i18n/useTranslation";
import { EffectText } from "@/game/EffectText";
import type { StackCard } from "@/game/overlay/types";
import { stackCardCaption } from "@/game/overlay/viewer/stackCardCaption";
import { CardTextField } from "@/i18n/CardTextField";
import { useCardTranslations } from "@/i18n/useCardTranslations";

type Params = {
  card: StackCard;
  onZoom: (cardId: string, artId?: string) => void;
  showThumbnail: boolean;
};

export function ArenaInspectorSourceEffect({ card, onZoom, showThumbnail }: Params) {
  const { t } = useTranslation();
  const translations = useCardTranslations();
  const definition = getCardDefinition(card.cardId);
  const effect = card.role === "linked" ? definition?.linkEffect : definition?.inheritedEffectText;
  const colors =
    card.cardId && !card.faceDown ? definition?.colors.map((color) => COLORS[colorKey(color)].base) : undefined;
  const revealed = Boolean(card.cardId) && !card.faceDown;
  const used = revealed && card.oncePerTurnUsed === true;
  const borderColors = colors?.length ? colors : [COLORS.Neutral.base];
  const border = `linear-gradient(to bottom, ${borderColors.flatMap((color, index) => [`${color} ${(index * 100) / borderColors.length}%`, `${color} ${((index + 1) * 100) / borderColors.length}%`]).join(", ")})`;
  return (
    <div
      className="arena-permanent-inspector__effect arena-permanent-inspector__effect--source"
      style={{ "--source-border": border } as CSSProperties}
      data-role={card.role}
      data-card-id={card.cardId || undefined}
      data-thumbnail={showThumbnail}
      data-once-per-turn-used={used || undefined}
      data-empty={(card.cardId && !card.faceDown && !effect) || undefined}
    >
      {showThumbnail &&
        (card.cardId ? (
          <button
            type="button"
            className="arena-permanent-inspector__source"
            onClick={() => onZoom(card.cardId, card.artId)}
            aria-label={t("feed.openCard", { card: stackCardCaption(card, t, translations) })}
          >
            <CardFull cardId={card.cardId} artId={card.artId} width={34} zoomOnHover={false} />
          </button>
        ) : (
          <CardBack width={34} useSelectedSleeve={false} />
        ))}
      <div>
        <span className="arena-permanent-inspector__effect-label">
          {stackCardCaption(card, t, translations)}
          {used ? (
            <span className="arena-permanent-inspector__used-effect">
              {t(card.role === "linked" ? "overlay.role.linkedUsed" : "overlay.role.inheritedUsed")}
            </span>
          ) : revealed ? (
            ` · ${t(card.role === "linked" ? "overlay.role.linked" : "overlay.role.inherited")}`
          ) : null}
        </span>
        {card.cardId && !card.faceDown ? (
          <p>
            {effect ? (
              <EffectText
                inspector
                asciiBrackets
                text={effect}
                cardId={card.cardId}
                field={card.role === "linked" ? CardTextField.LINK.value : CardTextField.INHERITED.value}
                surface="inspector-source"
              />
            ) : (
              t("overlay.noPrintedEffect")
            )}
          </p>
        ) : null}
        {card.cardId && !card.faceDown && definition?.effectText ? (
          <details className="arena-permanent-inspector__source-printed">
            <summary>{t("overlay.printedEffect")}</summary>
            <p>
              <EffectText
                inspector
                asciiBrackets
                text={definition.effectText}
                cardId={card.cardId}
                field={CardTextField.EFFECT.value}
                surface="inspector-source"
              />
            </p>
          </details>
        ) : null}
      </div>
    </div>
  );
}
