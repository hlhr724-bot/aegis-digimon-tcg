import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { CardZone } from "#api/engine/state/access";
import { Zone } from "@aegis/shared/schema/enums";

export type ManualCheckpoint = ReturnType<typeof captureManualCheckpoint>;

type SavedZone = { zone: CardZone; cards: CardInstance[] };

type Params = { state: GameState };

export function captureManualCheckpoint({ state }: Params) {
  return {
    turnSeat: state.turnSeat,
    isFirstPlayersFirstTurn: state.isFirstPlayersFirstTurn,
    turnCount: state.turnCount,
    memory: state.memory,
    table: {
      revealedJson: state.manual.revealedJson,
      turnPhase: state.manual.turnPhase,
      canHatch: state.manual.canHatch,
      canMoveFromBreeding: state.manual.canMoveFromBreeding,
      combatStage: state.manual.combatStage,
      attackerSeat: state.manual.attackerSeat,
      attackerPermanentId: state.manual.attackerPermanentId,
      attackTargetPermanentId: state.manual.attackTargetPermanentId,
      blockerPermanentId: state.manual.blockerPermanentId,
      signalSeat: state.manual.signalSeat,
      signalPermanentId: state.manual.signalPermanentId,
      signalInstanceId: state.manual.signalInstanceId,
      signalCardId: state.manual.signalCardId,
      signalArtId: state.manual.signalArtId,
      signalTargetPermanentId: state.manual.signalTargetPermanentId,
      signalTargetSeat: state.manual.signalTargetSeat,
      signalRevision: state.manual.signalRevision,
    },
    players: state.players.map((player) => {
      const zones: SavedZone[] = [
        { zone: Zone.Deck, cards: Array.from(player.deck) },
        { zone: Zone.EggDeck, cards: Array.from(player.eggDeck) },
        { zone: Zone.Hand, cards: Array.from(player.hand) },
        { zone: Zone.Security, cards: Array.from(player.security) },
        { zone: Zone.Trash, cards: Array.from(player.trash) },
        { zone: Zone.Delay, cards: Array.from(player.delayZone) },
      ];
      const capturePermanent = (permanent: Permanent) => ({
        permanent,
        top: permanent.topCard,
        sources: Array.from(permanent.stack),
        links: Array.from(permanent.linked),
        dp: permanent.currentDP,
        baseDP: permanent.baseDP,
        suspended: permanent.isSuspended,
        inBreeding: permanent.inBreeding,
        marker: permanent.manualMarker,
        statuses: Array.from(permanent.manualStatuses),
        securityAttack: permanent.securityAttack,
        securityAttackModifier: permanent.securityAttackModifier,
        keywords: Array.from(permanent.keywords),
        grantedKeywords: Array.from(permanent.grantedKeywords),
        colors: Array.from(permanent.originalColorsOverride),
      });
      const battle = player.battleArea.map(capturePermanent);
      const breeding = player.breeding ? capturePermanent(player.breeding) : undefined;
      const cards = new Set<CardInstance>(zones.flatMap((entry) => entry.cards));
      for (const entry of [...battle, ...(breeding ? [breeding] : [])]) {
        for (const card of [entry.top, ...entry.sources, ...entry.links]) {
          cards.add(card);
        }
      }
      return { player, zones, battle, breeding, faces: Array.from(cards, (card) => ({ card, faceUp: card.faceUp })) };
    }),
  };
}
