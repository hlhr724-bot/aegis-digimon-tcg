import type { GameState, SequencedServerEvent } from "@aegis/shared";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { Zone } from "@aegis/shared/schema/enums";

const SEATS = [0, 1] as const;

export function createLibraryKnowledgeTracker() {
  const known = new Set<string>();

  function observeBatch(state: GameState, events: readonly SequencedServerEvent[]) {
    for (const event of events) {
      if (event.kind === "matchStarted") {
        known.clear();
      }
      if (event.kind === "deckShuffled" && event.deck === "deck") {
        for (const card of state.players[event.seat]?.deck ?? []) {
          known.delete(card.instanceId);
        }
      }
      if (event.kind === "cardsMoved" && event.to === Zone.Deck) {
        for (const id of event.instanceIds) {
          known.add(id);
        }
      }
    }
    for (const seat of SEATS) {
      for (const card of state.players[seat]?.deck ?? []) {
        if (card.faceUp) {
          known.add(card.instanceId);
        }
      }
    }
  }

  function observeDecision(request: DecisionRequest) {
    for (const card of request.options?.visibleCards ?? []) {
      known.add(card.instanceId);
    }
  }

  function getKnowledge(state: GameState): string | undefined {
    for (const seat of SEATS) {
      const top = state.players[seat]?.deck[0];
      if (top !== undefined && (top.faceUp || known.has(top.instanceId))) {
        return `seat ${seat} library top card`;
      }
    }
    return undefined;
  }

  return { observeBatch, observeDecision, getKnowledge };
}
