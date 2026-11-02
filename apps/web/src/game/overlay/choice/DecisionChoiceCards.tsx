import { OpenDecisionCardButton } from "@/game/overlay/choice/OpenDecisionCardButton";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { CardFull } from "../../../design/cards";
import { useTranslation } from "../../../i18n";
import type { DecisionCandidate } from "./decisionTypes";

/**
 * The cards a `chooseOption` decision is about, shown read-only above its choices.
 *
 * A placement question ("top or bottom of the deck?") is asked about cards the deck
 * redacts, so without this strip the player answers before ever seeing them.
 */
export function DecisionChoiceCards({
  candidates,
  wideDialog,
  largeCards = false,
}: {
  candidates: readonly DecisionCandidate[];
  wideDialog: boolean;
  largeCards?: boolean;
}) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const cardWidth =
    wideDialog && largeCards ? (candidates.length > 5 ? 144 : 180) : wideDialog && candidates.length > 3 ? 132 : 104;
  // A digivolution-requirement question is about a card in the player's own hand, which
  // was never revealed; label the strip by what the question is about.
  const allInHand = candidates.length > 0 && candidates.every((candidate) => candidate.zone === "hand");
  return (
    <div className="decision-overlay__choice-cards" style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ds-text-3)",
          marginBottom: 10,
        }}
      >
        {t(allInHand ? "overlay.choiceHandCards" : "overlay.choiceRevealedCards")}
      </div>
      <div className="decision-overlay__grid">
        {candidates.map((candidate) => (
          <div key={candidate.instanceId} className="decision-candidate-tile" style={{ width: cardWidth }}>
            <CardFull cardId={candidate.cardId ?? ""} artId={candidate.artId} width={cardWidth} />
            {candidate.cardId ? (
              <span className="decision-overlay__candidate-name">{getCardName(candidate.cardId)}</span>
            ) : null}
            <OpenDecisionCardButton cardId={candidate.cardId} artId={candidate.artId} />
          </div>
        ))}
      </div>
    </div>
  );
}
