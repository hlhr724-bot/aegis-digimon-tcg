/* The piles a player can look through: a trash, which is public, and a security
   stack, which is not. Once the match is over, the decks and egg decks open too.

   Only face-up security cards are public; face-down cards stay hidden even from their
   owner, because the rules do not let the stack be looked at. The viewer therefore
   keeps every position — a hidden card is an empty slot, not a missing one. Once the
   match is over, the server reveals the whole stack and every slot shows its card. */

import type { FinalRevealCard } from "@aegis/shared";
import { useTranslation } from "../../../i18n";
import { parseActivatable, type ActivatableEntry } from "../../boardModel";
import { TrashViewerOverlay } from "../../overlay";
import { Side } from "../../side";
import type { PresentedPlayer } from "../types";
import type { RevealedZones, RevealedZoneView } from "../model/gameOutcome";
import type { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";

export function PileViewers({
  trashView,
  securityView,
  viewer,
  opponent,
  opponentName,
  revealed,
  revealedZoneView,
  sheet,
  trashActivatable,
  effectSourceMarks,
  onActivateTrashEffect,
  onCloseTrash,
  onCloseSecurity,
  onCloseRevealedZone,
}: {
  effectSourceMarks?: ReadonlyMap<string, EffectSourceMark>;
  /** Which player's trash is open, or nothing. */
  trashView: Side | null;
  /** Which player's security stack is open, or nothing. */
  securityView: Side | null;
  viewer: PresentedPlayer;
  opponent: PresentedPlayer;
  opponentName: string;
  /** Both players' hidden zones, top first, once the server reveals them after the match. */
  revealed?: RevealedZones;
  /** Which face-down pile is open, or nothing. */
  revealedZoneView: RevealedZoneView | null;
  sheet: boolean;
  /** The viewer may act right now, so their own trash offers its projected `[Trash] [Main]` effects. */
  trashActivatable: boolean;
  onActivateTrashEffect: (effect: ActivatableEntry) => void;
  onCloseTrash: () => void;
  onCloseSecurity: () => void;
  onCloseRevealedZone: () => void;
}) {
  const { t } = useTranslation();
  const trashOwner = trashView === Side.Viewer ? viewer : opponent;
  const securityOwner = securityView === Side.Viewer ? viewer : opponent;
  const securitySide = securityView === Side.Viewer ? "viewer" : "opponent";
  const revealedStack = revealed?.[securitySide].security;
  const securityFaceAt = (index: number): { cardId: string; artId: string } | undefined => {
    if (revealedStack) return revealedStack[index];
    const card = securityOwner.securityView?.[index];
    return card?.faceUp ? card : undefined;
  };
  const faceUpCount = revealedStack
    ? revealedStack.length
    : Array.from(securityOwner.securityView ?? []).filter((card) => card?.faceUp).length;
  const trashEffects =
    trashView === Side.Viewer && trashActivatable
      ? trashOwner.trash.map((c) => parseActivatable(c.activatableEffectsJson))
      : undefined;
  return (
    <>
      {trashView ? (
        <TrashViewerOverlay
          title={trashView === Side.Viewer ? t("game.yourTrash") : t("game.oppTrash", { name: opponentName })}
          cardIds={trashOwner.trash.map((c) => c.cardId)}
          instanceIds={trashOwner.trash.map((c) => c.instanceId)}
          artIds={trashOwner.trash.map((c) => c.artId)}
          effects={trashEffects}
          effectSourceMarks={effectSourceMarks}
          sheet={sheet}
          onActivateEffect={onActivateTrashEffect}
          onClose={onCloseTrash}
        />
      ) : null}

      {securityView ? (
        <TrashViewerOverlay
          title={
            securityView === Side.Viewer
              ? t("game.yourSecurityPile")
              : t("game.oppSecurityPile", { name: opponentName })
          }
          cardIds={Array.from(
            { length: securityOwner.securityCount },
            (_, index) => securityFaceAt(index)?.cardId ?? "",
          )}
          artIds={Array.from({ length: securityOwner.securityCount }, (_, index) => securityFaceAt(index)?.artId ?? "")}
          preserveOrder
          countLabel={t("overlay.securityCount", { faceUp: faceUpCount, count: securityOwner.securityCount })}
          emptyLabel={t("overlay.securityNoFaceUp")}
          sheet={sheet}
          onClose={onCloseSecurity}
        />
      ) : null}

      {revealed && revealedZoneView ? (
        <RevealedZoneViewer
          zone={revealedZoneView}
          cards={revealed[revealedZoneView.side === Side.Viewer ? "viewer" : "opponent"][revealedZoneView.zone]}
          opponentName={opponentName}
          sheet={sheet}
          onClose={onCloseRevealedZone}
        />
      ) : null}
    </>
  );
}

function RevealedZoneViewer({
  zone,
  cards,
  opponentName,
  sheet,
  onClose,
}: {
  zone: RevealedZoneView;
  cards: readonly FinalRevealCard[];
  opponentName: string;
  sheet: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const mine = zone.side === Side.Viewer;
  const title =
    zone.zone === "deck"
      ? mine
        ? t("overlay.reveal.yourDeck")
        : t("overlay.reveal.deck", { name: opponentName })
      : mine
        ? t("overlay.reveal.yourEggDeck")
        : t("overlay.reveal.eggDeck", { name: opponentName });
  return (
    <TrashViewerOverlay
      title={title}
      cardIds={cards.map((card) => card.cardId)}
      artIds={cards.map((card) => card.artId)}
      preserveOrder
      countLabel={t("overlay.reveal.count", { count: cards.length })}
      emptyLabel={t("overlay.reveal.empty")}
      sheet={sheet}
      onClose={onClose}
    />
  );
}
