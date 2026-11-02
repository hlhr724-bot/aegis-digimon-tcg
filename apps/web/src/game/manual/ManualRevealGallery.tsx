import type { GameState } from "@aegis/shared/schema/GameState";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import { ManualRevealedCardActions } from "@/game/manual/ManualRevealedCardActions";
import { Zone } from "@aegis/shared/schema/enums";
import type { Seat } from "@aegis/shared/schema/enums";
import { CardMini } from "@/design/cards";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { useTranslation } from "@/i18n/useTranslation";
import "@/game/manual/manualFeatures.css";
import "@/game/manual/manualRevealedCards.css";

type Props = { state: GameState; seat?: Seat; disabled?: boolean; send?: (command: ManualCommand) => void };
type RevealedCard = { cardId: string; artId?: string; seat: Seat; instanceId?: string; zone?: Zone };

export function ManualRevealGallery({ state, seat, disabled = false, send }: Props) {
  const { t } = useTranslation();
  const cards: RevealedCard[] = JSON.parse(state.manual.revealedJson || "[]");
  if (!cards.length) {
    return null;
  }
  return (
    <section className="manual-features__gallery" aria-label={t("manual.features.gallery")}>
      <strong>{t("manual.features.gallery")}</strong>
      <div className="manual-features__gallery-cards">
        {cards.map((card, index) => (
          <figure key={`${card.seat}:${card.cardId}:${index}`}>
            <CardMini cardId={card.cardId} artId={card.artId} width={64} />
            <figcaption>
              <span>{getCardDefinition(card.cardId)?.nameEn ?? card.cardId}</span>
              <small>{state.players[card.seat]?.displayName}</small>
            </figcaption>
            {send &&
            seat === card.seat &&
            card.instanceId &&
            card.zone &&
            card.zone !== Zone.BattleArea &&
            card.zone !== Zone.Breeding ? (
              <ManualRevealedCardActions
                from={{ zone: card.zone, instanceId: card.instanceId }}
                disabled={disabled}
                send={send}
              />
            ) : null}
          </figure>
        ))}
      </div>
    </section>
  );
}
